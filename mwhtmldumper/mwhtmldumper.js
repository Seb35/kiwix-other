#!/usr/bin/env node
"use strict";

/* Load required modules */
var fs = require('fs');
var request = require('request');
var domino = require('domino');
var urlParser = require('url');
var pathParser = require('path');
var http = require('follow-redirects').http;

/* Global variables */
var directory = 'static/';
var styleDirectory = directory + 'style/';
var htmlDirectory = directory + 'html/';
var mediaDirectory = directory + 'media/';
var javascriptDirectory = directory + 'js/';
var stylePath = styleDirectory + 'style.css';
var javascriptPath = javascriptDirectory + 'tools.js';
var withCategories = false;
var withMedias = true;
var cssClassBlackList = [ 'noprint', 'ambox', 'stub' ];
var cssClassCallsBlackList = [ 'plainlinks' ];

/* Article template */
var templateHtml = function(){/*
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title></title>
    <link rel="stylesheet" href="style/style.css" />
    <script src="js/tools.js"></script>
  </head>
<body class="mediawiki" style="background-color: white;">
  <div id="content" style="margin: 0px; border-width: 0px;">
    <a id="top"></a>
    <h1 id="firstHeading" class="firstHeading" style="margin-bottom: 0.5em; background-color: white;"></h1>
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
var articleIds = {};
articleIds['Vendôme'] = undefined;
articleIds['Angé'] = undefined;

//articleIds['Linux'] = undefined;
var parsoidUrl = 'http://parsoid.wmflabs.org/en/';
var webUrl = 'http://en.wikipedia.org/wiki/';

/* Initialization */
createDirectories();
saveStylesheet();
saveJavascript();

/* Save articles */
Object.keys(articleIds).map( function( articleId ) {
    var articleUrl = parsoidUrl + articleId ;
    console.info( 'Downloading article from ' + articleUrl + '...' );
    request( articleUrl, function( error, response, body ) {
	saveArticle( articleId, body.toString("utf8") );
    });
});

function saveArticle( articleId, html ) {
    console.info( 'Parsing HTML/RDF of ' + articleId + '...' );
    var parsoidDoc = domino.createDocument( html );
    
    /* Go through all images */
    var imgs = parsoidDoc.getElementsByTagName( 'img' );
    for ( var i = 0; i < imgs.length ; i++ ) {
	var img = imgs[i];
	var src = getFullUrl( img.getAttribute( 'src' ) );
	var filename = decodeURIComponent( pathParser.basename( urlParser.parse( src ).pathname ) );

	/* Download image */
	downloadFile(src, directory + filename );

	/* Change image source attribute to point to the local image */
	img.setAttribute( 'src', filename );
	
	/* Remove useless 'resource' attribute */
	img.removeAttribute( 'resource' ); 

	/* Remove image link */
	var linkNode = img.parentNode
	if ( linkNode.tagName === 'A' ) {
	    linkNode.parentNode.replaceChild( img, linkNode );
	}
    }

    /* Go through all links (a tag) */
    var as = parsoidDoc.getElementsByTagName( 'a' );
    for ( var i = 0; i < as.length ; i++ ) {
	var a = as[i];
	var rel = a.getAttribute( 'rel' );
	
	if ( rel ) {
	    /* Add 'external' class to external links */
	    if ( rel.substring( 0, 10 ) === 'mw:ExtLink' || rel === 'mw:WikiLink/Interwiki' ) {
		a.setAttribute( 'class', concatenateToAttribute( a.getAttribute( 'class'), 'external' ) );
	    }

	   /* Remove internal links pointing to no mirrored articles */
	    else if ( rel.substring( 0, 11 ) === 'mw:WikiLink' ) {
		var targetId = a.getAttribute( 'href' );;
		targetId = decodeURIComponent( a.getAttribute( 'href' ).replace(/^\.\//, '') );

		if ( ! ( targetId in articleIds ) ) {
		    while ( a.firstChild ) {
			a.parentNode.insertBefore( a.firstChild, a);
		    }
		    a.parentNode.removeChild( a );
		}
	    }
	}
    }

    /* Go through all reference calls */
    var spans = parsoidDoc.getElementsByTagName( 'span' );
    for ( var i = 0; i < spans.length ; i++ ) {
	var span = spans[i];
	var rel = span.getAttribute( 'rel' );
	if ( rel === 'dc:references' ) {
	    var sup = parsoidDoc.createElement( 'sup' );
	    if ( span.innerHTML ) {
		sup.innerHTML = span.innerHTML;
		span.parentNode.replaceChild(sup, span);
	    } else {
		deleteNode( span );
	    }
	}
    }

    /* Rewrite thumbnails */
    var figures = parsoidDoc.getElementsByTagName( 'figure' );
    for ( var i = 0; i < figures.length ; i++ ) {
	var figure = figures[i];
	var image = figure.getElementsByTagName( 'img' )[0];
	var imageWidth = parseInt( image.getAttribute( 'width' ) );
	var description = figure.getElementsByTagName( 'figcaption' )[0];

	var thumbDiv = parsoidDoc.createElement( 'div' );
	thumbDiv.setAttribute
	thumbDiv.setAttribute( 'class', 'thumb tright' );

	var thumbinnerDiv = parsoidDoc.createElement( 'div' );
	thumbinnerDiv.setAttribute( 'class', 'thumbinner' );
	thumbinnerDiv.setAttribute( 'style', 'width:' + ( imageWidth + 2) + 'px' );

	var thumbcaptionDiv = parsoidDoc.createElement( 'div' );
	thumbcaptionDiv.setAttribute( 'class', 'thumbcaption' );
	thumbcaptionDiv.setAttribute( 'style', 'text-align: left' );
	if ( description ) {
	    thumbcaptionDiv.innerHTML = description.innerHTML
	}

	thumbinnerDiv.appendChild( image );
	thumbinnerDiv.appendChild( thumbcaptionDiv );
	thumbDiv.appendChild( thumbinnerDiv );

	figure.parentNode.replaceChild(thumbDiv, figure);
    }

    /* Remove element with black listed CSS classes */
    cssClassBlackList.map( function( classname ) {
	var nodes = parsoidDoc.getElementsByClassName( classname );
	for ( var i = 0; i < nodes.length ; i++ ) {
	    deleteNode( nodes[i] );
	}
    });

    /* Create final document by merging template and parsoid documents */
    var doc = templateDoc;
    var contentNode = doc.getElementById( 'mw-content-text' );
    contentNode.innerHTML = parsoidDoc.getElementsByTagName( 'body' )[0].innerHTML;
    var contentTitleNode = doc.getElementById( 'firstHeading' );
    contentTitleNode.innerHTML = parsoidDoc.getElementsByTagName( 'title' )[0].innerHTML;
    var titleNode = doc.getElementsByTagName( 'title' )[0];
    titleNode.innerHTML = parsoidDoc.getElementsByTagName( 'title' )[0].innerHTML;

    /* Clean the DOM of all uncessary code */
    var allNodes = doc.getElementsByTagName( '*' );
    for ( var i = 0; i < allNodes.length ; i++ ) {                                                                                
        var node = allNodes[i];
	node.removeAttribute( 'data-parsoid' );
	node.removeAttribute( 'typeof' );
	node.removeAttribute( 'about' );
	node.removeAttribute( 'data-mw' );

	if ( node.getAttribute( 'rel' ) && node.getAttribute( 'rel' ).substr( 0, 3 ) === 'mw:' ) {
	    node.removeAttribute( 'rel' );
	}

	/* Remove a few css calls */
	cssClassCallsBlackList.map( function( classname )  {
	    if ( node.getAttribute( 'class' ) ) {
		node.setAttribute( 'class', node.getAttribute( 'class' ).replace( classname, '' ) );
	    }
	});
    }

    /* Write the static html file */
    writeFile( doc.documentElement.outerHTML, directory + articleId + '.html' );
}

/* Grab and concatenate javascript files */
function saveJavascript() {
    console.info( 'Creating javascript...' );
    fs.unlink( javascriptPath, function() {} );
    request( webUrl, function( error, response, html ) {
	var doc = domino.createDocument( html );
	var scripts = doc.getElementsByTagName( 'script' );
	
	for ( var i = 0; i < scripts.length ; i++ ) {
	    var script = scripts[i];
	    var url = script.getAttribute( 'src' );

	    if ( url ) {
		url = getFullUrl( url );
		console.info( 'Downloading javascript from ' + url );
		request( url , function( error, response, body ) {
		    fs.appendFile( javascriptPath, '\n' + body + '\n', function (err) {} );
		});
	    } else {
		fs.appendFile( javascriptPath, '\n' + script.innerHTML + '\n', function (err) {} );
	    }
	}
    });
}

/* Grab and concatenate stylesheet files */
function saveStylesheet() {
    console.info( 'Creating stylesheet...' );
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
		url = getFullUrl( url );
		
		console.info( 'Downloading CSS from ' + url );
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
			    url = getFullUrl( url );
			    
			    /* Download CSS dependency */
			    downloadFile(url, styleDirectory + filename );
			}
		    }
		    
		    fs.appendFile( stylePath, rewrittenCss, function (err) {} );
		});
	    }
	}
    });
}

/* Create directories for static files */
function createDirectories() {
    console.info( 'Creating directories at \'' + directory + '\'...' );
    createDirectory( directory );
    createDirectory( styleDirectory );
    createDirectory( htmlDirectory );
    createDirectory( mediaDirectory );
    createDirectory( javascriptDirectory );
}

/* Multiple developer friendly functions */
function getFullUrl( url ) {
    if ( ! urlParser.parse( url, false, true ).protocol ) {
	var protocol = urlParser.parse( url, false, true ).protocol || 'http:';
	var host = urlParser.parse( url, false, true ).host || urlParser.parse( webUrl ).host;
	var path = urlParser.parse( url, false, true ).path;
	url = protocol + '//' + host + path;
    }

    return url;
}

function deleteNode( node ) {
    node.parentNode.removeChild( node );
}

function concatenateToAttribute( old, add ) {
    return old ? old + ' ' + add : add;
}

function writeFile( data, path ) {
    console.info( 'Writing ' + path + '...' );
    fs.writeFile( path, data );
}

function downloadFile( url, path ) {
    fs.exists( path, function ( exists ) {
	if ( exists ) {
	    console.info( path + ' already downloaded, download will be skipped.' );
	} else {
	    console.info( 'Downloading ' + url + ' at ' + path + '...' );
	    var file = fs.createWriteStream( path );
	    var request = http.get( url, function(response) {
		response.pipe(file);
	    });
	}			    
    });
}

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

