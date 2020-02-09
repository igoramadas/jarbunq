TYPEDOC:= ./node_modules/typeoc/bin/typedoc
TSC:= ./node_modules/typescript/bin/tsc

build:
	$(TSC)

build-settings-sample:
	./jarbuncli.js build-settings-sample

certificate:
	openssl genrsa -out bunq.local.key 4096
	openssl req -new -x509 -key bunq.local.key -out bunq.local.crt -days 999 -subj /C=DE/L=Berlin/CN=bunq.local

clean:
	rm -rf ./lib
	rm -rf ./node_modules
	rm -f package-lock.json

docs:
	rm -rf ./docs/assets
	rm -rf ./docs/classes
	rm -rf ./docs/interfaces
	rm -rf ./docs/modules
	$(TYPEDOC) --disableOutputCheck
	cp CNAME docs/
	cp .nojekyll docs/

decrypt:
	./jarbuncli.js decrypt

encrypt:
	./jarbuncli.js encrypt

publish:
	$(TSC) --removeComments
	npm publish
	$(TSC)

run:
	$(TSC)
	DEBUG=axios node index.js

update:
	-ncu -u
	npm version $(shell date '+%y.%-V.%u%H') --force --allow-same-version
	npm install
	$(TSC)

pm2:
	git pull
	$(TSC)
	pm2 restart jarbunq

.PHONY: docs package pm2
