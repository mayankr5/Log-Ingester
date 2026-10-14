// Groups incoming logs into batched MongoDB writes ("group commit").
//
// Up to `maxInFlight` insertMany calls run at once. When a slot is free, a
// request's logs are written immediately, so there is no added delay at low
// load. When all slots are busy, logs from concurrent requests queue up and go
// out together in the next insertMany (up to `maxBatchSize` logs). Batches grow
// automatically with load, which cuts the number of database round trips.
//
// Each request still waits until its own logs are written, so a 201 response
// means the logs are actually stored.

class BatchWriter {
    constructor(model, { maxBatchSize = 1000, maxInFlight = 4 } = {}) {
        this.model = model;
        this.maxBatchSize = maxBatchSize;
        this.maxInFlight = maxInFlight;
        this.queue = [];        // { docs, resolve, reject } per write() call, in arrival order
        this.inFlight = 0;
        this.idleWaiters = [];  // resolved when everything queued has been written
        this.closed = false;
        this.stats = { batches: 0, logs: 0 };
    }

    write(docs) {
        if (this.closed) return Promise.reject(new Error('BatchWriter is closed'));
        if (docs.length === 0) return Promise.resolve();

        return new Promise((resolve, reject) => {
            this.queue.push({ docs, resolve, reject });
            this.pump();
        });
    }

    pump() {
        while (this.inFlight < this.maxInFlight && this.queue.length > 0) {
            this.flushOne();
        }
        if (this.inFlight === 0 && this.queue.length === 0) {
            this.idleWaiters.forEach(resolve => resolve());
            this.idleWaiters = [];
        }
    }

    async flushOne() {
        // Take whole requests from the front until the batch is full. A single
        // request bigger than maxBatchSize still goes out on its own.
        const entries = [];
        let size = 0;
        while (this.queue.length > 0 && (entries.length === 0 || size + this.queue[0].docs.length <= this.maxBatchSize)) {
            const entry = this.queue.shift();
            entries.push(entry);
            size += entry.docs.length;
        }

        this.inFlight++;
        try {
            // Logs are validated before they get here, so skip Mongoose document hydration.
            await this.model.insertMany(entries.flatMap(e => e.docs), { ordered: false, lean: true });
            this.stats.batches++;
            this.stats.logs += size;
            entries.forEach(e => e.resolve());
        } catch (err) {
            entries.forEach(e => e.reject(err));
        } finally {
            this.inFlight--;
            this.pump();
        }
    }

    // Waits for all queued logs to be written. Used on shutdown.
    close() {
        this.closed = true;
        if (this.inFlight === 0 && this.queue.length === 0) return Promise.resolve();
        return new Promise(resolve => this.idleWaiters.push(resolve));
    }
}

module.exports = { BatchWriter };
