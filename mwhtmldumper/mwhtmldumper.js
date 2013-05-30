#!/usr/bin/env node
"use strict";

/* Load required modules */
var fs = require('fs');
var request = require('request');
var domino = require('domino');
var urlParser = require('url');
var pathParser = require('path');
var http = require('follow-redirects').http;
var querystring = require('querystring');

/* Global variables */
var targetDirectory = 'static';
var articleIds = [ 'Kiwix' ];
var parsoidUrl = 'http://parsoid.wmflabs.org/en/';
var webUrl = 'http://en.wikipedia.org/wiki/';

/* Initialization */
createTargetDirectories( targetDirectory );

console.log( 'Creating stylesheet...' );
fs.unlink( targetDirectory + '/style.css' );
request( webUrl, function( error, response, html ) {
    var doc = domino.createDocument( html );
    var links = doc.getElementsByTagName( 'link' );

    for ( var i = 0; i < links.length ; i++ ) {
	var link = links[i];
	if (link.getAttribute('rel') === 'stylesheet') {
	    console.log( 'Downloading CSS from ' + 'http:' + link.getAttribute('href'));
	    downloadFileAndConcatenate( 'http:' + link.getAttribute('href'), targetDirectory + '/style.css' );
	}
    }
});

/* Download articles */
articleIds.map( function( articleId ) {
    var articleUrl = parsoidUrl + articleId ;
    console.log( 'Downloading ' + articleUrl + '...' );
    request( articleUrl, function( error, response, body ) {
	saveArticle( articleId, body );
    });
});

function saveArticle( articleId, html ) {
    console.log( 'Parsing HTML/RDF...' );
    var doc = domino.createDocument( html );

    /* Go through all images */
    var imgs = doc.getElementsByTagName( 'img' );
    for ( var i = 0; i < imgs.length ; i++ ) {
	var img = imgs[i];
	var src = img.getAttribute( 'src');
	var filename = querystring.unescape( pathParser.basename( urlParser.parse( src ).pathname ) );

	/* Download image */
	downloadFile(src, targetDirectory  + '/' + filename );

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

    /* Remove all head child nodes */
    var headNode = doc.getElementsByTagName('head')[0];
    var headChildNodes = headNode.childNodes;
    while ( headNode.childNodes.length > 0 ) {
	deleteNode( headNode.childNodes[0] );
    }

    /* Append stylesheet node */
    var linkNode = doc.createElement('link');
    linkNode.setAttribute('rel', 'stylesheet');
    linkNode.setAttribute('href', 'style.css');
    var headNode = doc.getElementsByTagName('head')[0];
    headNode = headNode.appendChild(linkNode);

    /* Write the static html file */
    writeFile( doc.documentElement.outerHTML, targetDirectory + '/' + articleId + '.html' );
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

/* Create directories for static files */
function createTargetDirectories( path ) {
    console.info( 'Creating target directories at \'' + path + '\'...' );
    createDirectory( path );
    createDirectory( path + '/style' );
    createDirectory( path + '/html' );
    createDirectory( path + '/media' );
    createDirectory( path + '/js' );
}

/* Create a directory if necessary */
function createDirectory( path ) {
    fs.mkdir( path, function( error ) {
	if ( ! fs.lstatSync( path ).isDirectory() ) {
	    console.error( 'Unable to create directory \'' + path + '\'' );
	    process.exit( 1 );
	}
    });
}