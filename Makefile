.PHONY: install mongo run stop test loadtest

install:
	npm install

# Throwaway local MongoDB on port 27017 (no MongoDB/Docker install needed).
mongo:
	node scripts/dev-mongo.js

# 3 API instances on ports 8001-8003, load balanced by Caddy on port 3000.
run:
	@mkdir -p ./run ./logs
	@PORT=8001 node index.js & echo $$! >> ./run/server.pids
	@PORT=8002 node index.js & echo $$! >> ./run/server.pids
	@PORT=8003 node index.js & echo $$! >> ./run/server.pids
	@caddy start

stop:
	@while read -r pid; do \
		kill "$$pid" 2>/dev/null || true; \
	done <./run/server.pids
	@caddy stop || true
	@rm -rf ./run

test:
	npm test

loadtest:
	node scripts/loadtest.js http://localhost:3000
