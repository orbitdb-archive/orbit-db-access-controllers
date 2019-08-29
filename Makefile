all:    |   clean-dependencies  test

deps:	clean
	npm	install

test:	deps
	npm	run	test

clean:
	rm	-rf	orbitdb/

clean-dependencies:	clean
	rm	-f	package-lock.json
	rm	-rf	node_modules/

.PHONY:	test

