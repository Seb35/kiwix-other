#!/usr/bin/env node
"use strict";

var fs = require('fs');
var request = require('request');
var domino = require('domino');
var urlParser = require('url');
var pathParser = require('path');
var http = require('follow-redirects').http;
var jquery = require('jquery');
var querystring = require('querystring');

var title = 'Paris';
var urlBase = 'http://parsoid.wmflabs.org/en/';
var wikiBase = 'http://en.wikipedia.org/wiki/';
var directory = 'static';

var url = urlBase + title;
var base = urlParser.parse( urlBase ).protocol + '//' + 
    urlParser.parse( urlBase ).host +
    urlParser.parse( urlBase ).pathname;

console.log( 'Creating directory ' + directory + '...' );
fs.mkdir(directory, function(e) {});

console.log( 'Creating stylesheet...' );
fs.unlink( directory + '/style.css' );
request( wikiBase + title , function( error, response, html ) {
    var doc = domino.createDocument( html );
    var links = doc.getElementsByTagName( 'link' );

    for ( var i = 0; i < links.length ; i++ ) {
	var link = links[i];
	if (link.getAttribute('rel') === 'stylesheet') {
	    console.log( 'Downloading CSS from ' + 'http:' + link.getAttribute('href'));
	    downloadFileAndConcatenate( 'http:' + link.getAttribute('href'), directory + '/style.css' );
	}
    }
});

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
	deleteNode( baseNode );
    }

    /* Go through all images */
    var imgs = doc.getElementsByTagName( 'img' );
    for ( var i = 0; i < imgs.length ; i++ ) {
	var img = imgs[i];
	var src = img.getAttribute( 'src');
	var filename = querystring.unescape( pathParser.basename( urlParser.parse( src ).pathname ) );

	/* Download image */
	downloadFile(src, directory + '/' + filename );

	/* Change image source attribute to point to the local image */
	img.setAttribute( 'src', filename );

	/* Remove image link */
	var linkNode = img.parentNode
	if (linkNode.tagName === 'A' ) {
	    linkNode.parentNode.replaceChild(img, linkNode);
	}
    };

    /* Remove noprint css elements */
    var noprintNodes = doc.getElementsByClassName( 'noprint' );
    for ( var i = 0; i < noprintNodes.length ; i++ ) {
	var node = noprintNodes[i];
	deleteNode( node );
    }

    /* Remove parsoid stuff */

    /* Append stylesheet node */
    var linkNode = doc.createElement('link');
    linkNode.setAttribute('rel', 'stylesheet');
    linkNode.setAttribute('href', 'style.css');
    var headNode = doc.getElementsByTagName('head')[0];
    headNode = headNode.appendChild(linkNode);

    /* Write the static html file */
    writeFile( doc.documentElement.outerHTML, directory + '/' + title + '.html' );
}

function deleteNode( node ) {
    node.parentNode.removeChild( node );
}

function writeFile( data, path ) {
    console.log( 'Writing ' + path + '...' );
    fs.writeFile( path, data );
}

function downloadFile( url, path ) {
    console.log( 'Downloading ' + url + ' at ' + path + '...' );
    var file = fs.createWriteStream( path );
    var request = http.get( url, function(response) {
	response.pipe(file);
    });
}

function downloadFileAndConcatenate( url, path ) {
    request( url , function( error, response, body ) {
	fs.appendFile( path, body, function (err) {} );
    });
}
