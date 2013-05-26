#!/usr/bin/env node
"use strict";

var fs = require('fs');
var request = require('request');
var domino = require('domino');
var urlParser = require('url');
var pathParser = require('path');
var http = require('follow-redirects').http;
var jquery = require('jquery');

var title = 'Kiwix';
var urlBase = 'http://parsoid.wmflabs.org/en/';
var directory = 'static';

var url = urlBase + title;
var base = urlParser.parse( urlBase ).protocol + '//' + 
    urlParser.parse( urlBase ).host +
    urlParser.parse( urlBase ).pathname;

console.log( 'Creating directory ' + directory + '...' );
fs.mkdir(directory, function(e) {});

console.log( 'Downloading ' + url + '...' );
request( url, function( error, response, body ) {
    parseHtml( body );
});

function parseHtml( html ) {

    console.log( 'Parsing HTML/RDF...' );

    /* Get the base... and remove it */
    var doc = domino.createDocument( html );
    var baseNode = doc.getElementsByTagName( 'base' )[0];
    if ( baseNode ) {
	base = 'http:' + baseNode.getAttribute( 'href' );
	base = urlParser.parse( urlBase ).protocol + '//' + 
	    urlParser.parse( base ).host +
	    pathParser.dirname( urlParser.parse( base ).pathname ) + '/';
	baseNode.parentNode.removeChild( baseNode );
    }

    /* Download images and rewrite the src attribute */
    var imgs = doc.getElementsByTagName( 'img' );
    for (var i = 0; i < imgs.length ; i++) {
	var img = imgs[i];
	var src = img.getAttribute( 'src');
	var path = urlParser.parse( src ).pathname;
	src = src.substring(2);
	downloadFile(base + src, directory + '/' + pathParser.basename( path ) );
	img.setAttribute( 'src', pathParser.basename( path ) );
    };

    var filename = directory + '/' + title + '.html';
    console.log( 'Writing ' + filename + '...' );
    fs.writeFile( filename, doc.documentElement.outerHTML );
}

function downloadFile( url, path ) {
    console.log( 'Downloading ' + url + ' at ' + path + '...' );
    var file = fs.createWriteStream( path );
    var request = http.get( url, function(response) {
	response.pipe(file);
	console.log( "Downloaded " + path );
    });
}