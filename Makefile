all: | clean-dependencies deps

deps:	clean
	npm	install

clean:
	rm	-rf	orbitdb/

clean-dependencies:	clean
	rm	-f	package-lock.json
	rm	-rf	node_modules/

.PHONY:	all

