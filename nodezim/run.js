#!/usr/bin/env node
"use strict";

var zim = require('./build/Release/zim');

zim.callback(false, function(err, result) {
    console.warn(result);
});
