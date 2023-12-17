.PHONY: run stop

run:
	@mkdir -p ./run
	@PORT=8001 node index.js & echo $$! >> ./run/server.pids
	@PORT=8002 node index.js & echo $$! >> ./run/server.pids
	@PORT=8003 node index.js & echo $$! >> ./run/server.pids
	@caddy start

stop:
	@while read -r file; do \
        kill "$$file"; \
    done <./run/server.pids
	@caddy stop
	@rm -rf ./run