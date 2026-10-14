.PHONY: install mongo run stop seed test loadtest

PORTS := 8001 8002 8003

install:
	npm install

# Throwaway local MongoDB on port 27017 (no MongoDB/Docker install needed).
mongo:
	node scripts/dev-mongo.js

# 3 API instances on ports 8001-8003, load balanced by Caddy on port 3000.
# Stops any previous run first, so running it twice is safe.
run: stop
	@mkdir -p ./run ./logs
	@for port in $(PORTS); do \
		PORT=$$port node index.js >> ./logs/app-$$port.log 2>&1 & echo $$! >> ./run/server.pids; \
	done
	@caddy start >/dev/null 2>&1
	@for i in $$(seq 1 30); do curl -sf http://localhost:3000/health >/dev/null && break; sleep 0.5; done; \
	curl -sf http://localhost:3000/health >/dev/null \
		&& echo "Running at http://localhost:3000/explorer/ (app logs in ./logs/)" \
		|| (echo "Failed to start. Is MongoDB running (make mongo)? See ./logs/app-*.log"; exit 1)

stop:
	@if [ -f ./run/server.pids ]; then \
		while read -r pid; do kill "$$pid" 2>/dev/null || true; done < ./run/server.pids; \
	fi
	@# Also stop anything left on our ports from an older run.
	@for port in $(PORTS); do \
		lsof -ti tcp:$$port -sTCP:LISTEN | xargs kill 2>/dev/null || true; \
	done
	@caddy stop >/dev/null 2>&1 || true
	@rm -rf ./run

# Add 500 realistic sample logs to the running service.
seed:
	node scripts/seed.js http://localhost:3000

test:
	npm test

loadtest:
	node scripts/loadtest.js http://localhost:3000
