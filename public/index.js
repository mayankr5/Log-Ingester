document.addEventListener('DOMContentLoaded', function () {
    const queryForm = document.getElementById('query-form');
    const queryInput = document.getElementById('query');
    const fromTime = document.getElementById('time-query-from');
    const toTime = document.getElementById('time-query-to');
    const logTable = document.getElementById('log-table');
    var currentDate = new Date();
    var twentyFourHoursAgo = new Date(currentDate.getTime() - (24 * 60 * 60 * 1000));
    var isoTimeLast24Hours = twentyFourHoursAgo.toISOString().slice(0, -8);
    fromTime.value = isoTimeLast24Hours;
    toTime.value = currentDate.toISOString().slice(0, -8);

    queryForm.addEventListener('submit', function (event) {
        event.preventDefault()
        const queryVal = queryInput.value.trim()
        const timeQuery = `(timestamp >= '${new Date(fromTime.value).toISOString()}' AND timestamp <= '${new Date(toTime.value).toISOString()}')`
        const query = `${queryVal ? ("(" + queryVal + ") AND"): ""} ${timeQuery}`;
        console.log(query);
        fetchData(query);
    });

    function fetchData(query) {
        const apiUrl = '//localhost:3000/query?q=' + encodeURIComponent(query);

        fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        })
        .then(response =>  response.json())
        .then(data => {
            clearTable();
            if(data.length === 0){
                showLogDetails("No Logs Found!")
            }
            data.forEach(log => {
                addLogToTable(log);
            });
        })
        .catch(error => {
            console.error('Error fetching data:', error);
            showLogDetails('Error fetching data. Please check your query and try again.');
        });
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

        const formattedTimestamp = new Date(log.timestamp).toLocaleString();

        timestampCell.textContent = formattedTimestamp;
        levelCell.textContent = log.level;
        messageCell.textContent = log.message;

        row.addEventListener('click', function () {
            showLogDetails(log);
        });
    }

    function showLogDetails(log) {
        const filteredLog = filterKeys(log, ['_id', '__v']);
    
        const logDetails = JSON.stringify(filteredLog, null, 2);
        const modalOverlay = document.createElement('div');
        modalOverlay.classList.add('modal-overlay');
    
        const modalContent = document.createElement('div');
        modalContent.classList.add('modal-content');
    
        const preElement = document.createElement('pre');
        preElement.textContent = logDetails;
    
        modalContent.appendChild(preElement);
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);
    
        modalOverlay.addEventListener('click', function () {
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
