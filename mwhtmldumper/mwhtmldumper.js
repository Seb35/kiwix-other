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
var directory = 'static/';
var styleDirectory = directory + 'style/';
var htmlDirectory = directory + 'html/';
var mediaDirectory = directory + 'media/';
var jsDirectory = directory + 'js/';
var stylePath = styleDirectory + 'style.css';

/* Article template */
var templateHtml = function(){/*
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title></title>
    <link rel="stylesheet" href="style/style.css" />
  </head>
<body>
  <div id="content" style="margin: 0px;">
    <a id="top"></a>
    <h1 id="firstHeading" class="firstHeading"></h1>
    <div id="bodyContent">
      <div id="mw-content-text">
      </div>
    </div>
  </div>
</body>
</html>
*/}.toString().slice(14,-3);
var templateDoc = domino.createDocument( templateHtml );

/* Input variables */
var articleIds = [ 'Kiwix', 'Paris' ];
var parsoidUrl = 'http://parsoid.wmflabs.org/en/';
var webUrl = 'http://en.wikipedia.org/wiki/';

/* Initialization */
createDirectories();

console.log( 'Creating stylesheet...' );
fs.unlink( stylePath, function() {} );
request( webUrl, function( error, response, html ) {
    var doc = domino.createDocument( html );
    var links = doc.getElementsByTagName( 'link' );
    var cssUrlRegexp = new RegExp( 'url\\([\'"]{0,1}(.+?)[\'"]{0,1}\\)', 'gi' );
    var cssDataUrlRegex = new RegExp( '^data' );
    
    for ( var i = 0; i < links.length ; i++ ) {
	var link = links[i];
	if (link.getAttribute('rel') === 'stylesheet') {
	    var url = link.getAttribute('href');
	    
	    /* Need a rewrite if url doesn't include protocol */
	    if ( ! urlParser.parse( url, false, true ).protocol ) {
		var protocol = urlParser.parse( url, false, true ).protocol || 'http:';
		var host = urlParser.parse( url, false, true ).host || urlParser.parse( webUrl ).host;
		var path = urlParser.parse( url, false, true ).path;
		url = protocol + '//' + host + path;
	    }

	    console.log( 'Downloading CSS from ' + url );
	    request( url , function( error, response, body ) {

		/* Downloading CSS dependencies */
		var match;
		var rewrittenCss = body;

		while (match = cssUrlRegexp.exec( body ) ) {
		    var url = match[1];

		    /* Avoid 'data', so no url dependency */
		    if ( ! url.match( '^data' ) ) {
			var filename = pathParser.basename( urlParser.parse( url, false, true ).pathname );

			/* Rewrite the CSS */
			rewrittenCss = rewrittenCss.replace( url, filename );

			/* Need a rewrite if url doesn't include protocol */
			if ( ! urlParser.parse( url, false, true ).protocol ) {
			    var protocol = urlParser.parse( url, false, true ).protocol || 'http:';
			    var host = urlParser.parse( url, false, true ).host || urlParser.parse( webUrl ).host;
			    var path = urlParser.parse( url, false, true ).path;
			    url = protocol + '//' + host + path;
			}
			
			/* Download CSS dependency */
			downloadFile(url, styleDirectory + filename );
		    }
		}

		fs.appendFile( stylePath, rewrittenCss, function (err) {} );
	    });
	}
    }
});

/* Download articles */
articleIds.map( function( articleId ) {
    var articleUrl = parsoidUrl + articleId ;
    console.log( 'Downloading article from ' + articleUrl + '...' );
    request( articleUrl, function( error, response, body ) {
	saveArticle( articleId, body );
    });
});

function saveArticle( articleId, html ) {
    console.log( 'Parsing HTML/RDF...' );
    var parsoidDoc = domino.createDocument( html );
    
    /* Go through all images */
    var imgs = parsoidDoc.getElementsByTagName( 'img' );
    for ( var i = 0; i < imgs.length ; i++ ) {
	var img = imgs[i];
	var src = img.getAttribute( 'src');
	var filename = querystring.unescape( pathParser.basename( urlParser.parse( src ).pathname ) );

	/* Download image */
	downloadFile(src, directory  + '/' + filename );

	/* Change image source attribute to point to the local image */
	img.setAttribute( 'src', filename );

	/* Remove image link */
	var linkNode = img.parentNode
	if (linkNode.tagName === 'A' ) {
	    linkNode.parentNode.replaceChild(img, linkNode);
	}
    };

    /* Remove noprint css elements */
    var noprintNodes = parsoidDoc.getElementsByClassName( 'noprint' );
    for ( var i = 0; i < noprintNodes.length ; i++ ) {
	var node = noprintNodes[i];
	deleteNode( node );
    }

    /* Create final document by merging template and parsoid documents */
    var doc = templateDoc;
    var contentNode = doc.getElementById( 'mw-content-text' );
    contentNode.innerHTML = parsoidDoc.getElementsByTagName('body')[0].innerHTML;
    var contentTitleNode = doc.getElementById( 'firstHeading' );
    contentTitleNode.innerHTML = parsoidDoc.getElementsByTagName('title')[0].innerHTML;
    var titleNode = doc.getElementsByTagName('title')[0];
    titleNode.innerHTML = parsoidDoc.getElementsByTagName('title')[0].innerHTML;

    /* Write the static html file */
    writeFile( doc.documentElement.outerHTML, directory + articleId + '.html' );
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

/* Create directories for static files */
function createDirectories() {
    console.info( 'Creating directories at \'' + directory + '\'...' );
    createDirectory( directory );
    createDirectory( styleDirectory );
    createDirectory( htmlDirectory );
    createDirectory( mediaDirectory );
    createDirectory( jsDirectory );
}

/* Create a directory if necessary */
function createDirectory( path ) {
    fs.mkdir( path, function( error ) {
	fs.exists( path, function ( exists ) {
	    if ( error && ! ( exists && fs.lstatSync( path ).isDirectory() ) ) {
		console.error( 'Unable to create directory \'' + path + '\'' );
		process.exit( 1 );
	    }
	});
    });
}