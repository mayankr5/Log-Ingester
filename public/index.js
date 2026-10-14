document.addEventListener('DOMContentLoaded', function () {
    const queryForm = document.getElementById('query-form');
    const queryInput = document.getElementById('query');
    const fromTime = document.getElementById('time-query-from');
    const toTime = document.getElementById('time-query-to');
    const logTable = document.getElementById('log-table');
    const loadMoreButton = document.getElementById('load-more');
    const status = document.getElementById('status');

    const PAGE_SIZE = 50;
    let currentParams = null;
    let nextCursor = null;

    // datetime-local inputs use local time, so format the default window in local time too.
    function toLocalInputValue(date) {
        const offsetMs = date.getTimezoneOffset() * 60 * 1000;
        return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
    }
    const now = new Date();
    fromTime.value = toLocalInputValue(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    toTime.value = toLocalInputValue(now);

    queryForm.addEventListener('submit', function (event) {
        event.preventDefault();
        currentParams = new URLSearchParams({ q: queryInput.value.trim(), limit: PAGE_SIZE });
        if (fromTime.value) currentParams.set('from', new Date(fromTime.value).toISOString());
        if (toTime.value) currentParams.set('to', new Date(toTime.value).toISOString());
        clearTable();
        fetchPage(null);
    });

    loadMoreButton.addEventListener('click', function () {
        fetchPage(nextCursor);
    });

    async function fetchPage(cursor) {
        const params = new URLSearchParams(currentParams);
        if (cursor) params.set('cursor', cursor);
        loadMoreButton.hidden = true;
        status.textContent = 'Loading...';

        try {
            const response = await fetch('/logs?' + params.toString());
            const data = await response.json();
            if (!response.ok) {
                status.textContent = 'Error: ' + data.error;
                return;
            }

            data.logs.forEach(addLogToTable);
            nextCursor = data.nextCursor;
            loadMoreButton.hidden = !nextCursor;
            const shown = logTable.rows.length - 1;
            status.textContent = shown === 0 ? 'No logs found.' : `Showing ${shown} logs${nextCursor ? '' : ' (end of results)'}`;
        } catch (error) {
            console.error('Error fetching data:', error);
            status.textContent = 'Could not reach the server. Please try again.';
        }
    }

    function clearTable() {
        while (logTable.rows.length > 1) {
            logTable.deleteRow(1);
        }
    }

    function addLogToTable(log) {
        const row = logTable.insertRow(-1);
        const timestampCell = row.insertCell(0);
        const levelCell = row.insertCell(1);
        const messageCell = row.insertCell(2);

        timestampCell.textContent = new Date(log.timestamp).toLocaleString();
        levelCell.textContent = log.level;
        messageCell.textContent = log.message;

        row.addEventListener('click', function () {
            showLogDetails(log);
        });
    }

    function showLogDetails(log) {
        const filteredLog = filterKeys(log, ['_id', '__v']);

        const modalOverlay = document.createElement('div');
        modalOverlay.classList.add('modal-overlay');

        const modalContent = document.createElement('div');
        modalContent.classList.add('modal-content');

        const preElement = document.createElement('pre');
        preElement.textContent = JSON.stringify(filteredLog, null, 2);

        modalContent.appendChild(preElement);
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);

        modalOverlay.addEventListener('click', function (event) {
            if (event.target === modalOverlay) {
                document.body.removeChild(modalOverlay);
            }
        });
    }

    function filterKeys(obj, keysToExclude) {
        if (typeof obj !== 'object' || obj === null) {
            return obj;
        }

        if (Array.isArray(obj)) {
            return obj.map(item => filterKeys(item, keysToExclude));
        }

        const filteredObj = {};
        for (const [key, value] of Object.entries(obj)) {
            if (!keysToExclude.includes(key)) {
                filteredObj[key] = filterKeys(value, keysToExclude);
            }
        }

        return filteredObj;
    }
});
