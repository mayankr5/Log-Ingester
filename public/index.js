document.addEventListener('DOMContentLoaded', function () {
    const $ = (id) => document.getElementById(id);
    const queryForm = $('query-form');
    const queryInput = $('query');
    const rangeSelect = $('range');
    const customRange = $('custom-range');
    const fromInput = $('from');
    const toInput = $('to');
    const logBody = $('log-body');
    const status = $('status');
    const errorBox = $('error');
    const empty = $('empty');
    const loadMoreButton = $('load-more');
    const details = $('details');

    const PAGE_SIZE = 50;
    const RANGES = { '15m': 15 * 60e3, '1h': 60 * 60e3, '24h': 24 * 60 * 60e3, '7d': 7 * 24 * 60 * 60e3 };
    // Fields you can click in the details panel to add to the search.
    const FILTERABLE = ['level', 'resourceId', 'traceId', 'spanId', 'commit', 'metadata.parentResourceId'];

    let currentParams = null;
    let nextCursor = null;
    let shown = 0;
    let selectedRow = null;

    // datetime-local inputs use local time.
    function toLocalInputValue(date) {
        return new Date(date.getTime() - date.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
    }

    // ----- search -----

    function buildParams() {
        const params = new URLSearchParams({ q: queryInput.value.trim(), limit: PAGE_SIZE });
        const range = rangeSelect.value;
        if (RANGES[range]) {
            params.set('from', new Date(Date.now() - RANGES[range]).toISOString());
        } else if (range === 'custom') {
            if (fromInput.value) params.set('from', new Date(fromInput.value).toISOString());
            if (toInput.value) params.set('to', new Date(toInput.value).toISOString());
        }
        return params;
    }

    function search() {
        currentParams = buildParams();
        logBody.replaceChildren();
        shown = 0;
        closeDetails();
        fetchPage(null);
    }

    async function fetchPage(cursor) {
        const params = new URLSearchParams(currentParams);
        if (cursor) params.set('cursor', cursor);

        loadMoreButton.hidden = true;
        errorBox.hidden = true;
        empty.hidden = true;
        status.textContent = 'Loading…';

        try {
            const response = await fetch('/logs?' + params.toString());
            const data = await response.json();
            if (!response.ok) {
                showError(data.error || 'Search failed');
                status.textContent = '';
                return;
            }

            data.logs.forEach(addRow);
            shown += data.logs.length;
            nextCursor = data.nextCursor;
            loadMoreButton.hidden = !nextCursor;
            empty.hidden = shown > 0;
            status.textContent = shown === 0 ? '' : `Showing ${shown} log${shown === 1 ? '' : 's'}${nextCursor ? '' : ' · end of results'}`;
        } catch (err) {
            console.error(err);
            showError('Could not reach the server.');
            status.textContent = '';
        }
    }

    function showError(message) {
        errorBox.textContent = message;
        errorBox.hidden = false;
    }

    // ----- table -----

    function cell(text, className) {
        const td = document.createElement('td');
        td.textContent = text ?? '';
        if (className) td.className = className;
        td.title = text ?? '';
        return td;
    }

    function addRow(log) {
        const row = document.createElement('tr');

        const levelCell = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = `level ${log.level}`;
        badge.textContent = log.level;
        levelCell.appendChild(badge);

        row.append(
            cell(formatTime(log.timestamp), 'time'),
            levelCell,
            cell(log.resourceId, 'resource'),
            cell(log.message),
        );
        row.addEventListener('click', () => openDetails(log, row));
        logBody.appendChild(row);
    }

    function formatTime(ts) {
        const d = new Date(ts);
        return d.toLocaleString(undefined, {
            month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        });
    }

    // ----- details panel -----

    function flatten(obj, prefix = '') {
        return Object.entries(obj).flatMap(([key, value]) =>
            value && typeof value === 'object' && !Array.isArray(value)
                ? flatten(value, `${prefix}${key}.`)
                : [[`${prefix}${key}`, value]]);
    }

    function openDetails(log, row) {
        if (selectedRow) selectedRow.classList.remove('selected');
        selectedRow = row;
        row.classList.add('selected');

        const { _id, ...rest } = log;
        const fields = $('details-fields');
        fields.replaceChildren();

        for (const [key, value] of flatten(rest)) {
            const dt = document.createElement('dt');
            dt.textContent = key;
            const dd = document.createElement('dd');
            dd.textContent = key === 'timestamp' ? new Date(value).toISOString() : value;
            if (FILTERABLE.includes(key)) {
                dd.classList.add('clickable');
                dd.title = 'Add to search';
                dd.addEventListener('click', () => addFilter(key, value));
            }
            fields.append(dt, dd);
        }

        $('details-json').textContent = JSON.stringify(rest, null, 2);
        details.hidden = false;
    }

    function closeDetails() {
        details.hidden = true;
        if (selectedRow) selectedRow.classList.remove('selected');
        selectedRow = null;
    }

    function addFilter(field, value) {
        const term = /[\s()"]/.test(value) ? `${field}:"${value}"` : `${field}:${value}`;
        const current = queryInput.value.trim();
        queryInput.value = current ? `${current} AND ${term}` : term;
        search();
    }

    // ----- health -----

    async function checkHealth() {
        const el = $('health');
        try {
            const res = await fetch('/health');
            const ok = res.ok;
            el.textContent = ok ? 'API healthy' : 'Database down';
            el.className = 'health ' + (ok ? 'up' : 'down');
        } catch {
            el.textContent = 'API unreachable';
            el.className = 'health down';
        }
    }

    // ----- wiring -----

    queryForm.addEventListener('submit', (event) => {
        event.preventDefault();
        search();
    });

    rangeSelect.addEventListener('change', () => {
        customRange.hidden = rangeSelect.value !== 'custom';
        if (rangeSelect.value === 'custom' && !fromInput.value) {
            const now = new Date();
            fromInput.value = toLocalInputValue(new Date(now.getTime() - RANGES['24h']));
            toInput.value = toLocalInputValue(now);
        }
        if (rangeSelect.value !== 'custom') search();
    });

    document.querySelectorAll('.chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            queryInput.value = chip.dataset.q;
            search();
        });
    });

    loadMoreButton.addEventListener('click', () => fetchPage(nextCursor));
    $('close-details').addEventListener('click', closeDetails);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeDetails();
        if (event.key === '/' && document.activeElement !== queryInput) {
            event.preventDefault();
            queryInput.focus();
        }
    });

    checkHealth();
    setInterval(checkHealth, 15000);
    search();
});
