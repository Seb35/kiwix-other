#!/usr/bin/env node
"use strict";

/* Load required modules */
var fs = require('graceful-fs');
var request = require('request');
var domino = require('domino');
var urlParser = require('url');
var pathParser = require('path');
var http = require('follow-redirects').http;
var swig = require('swig');
var httpsync = require('httpsync');
var jsdom = require("jsdom");
var async = require("async");

/* Increase parallel connection limit */
http.globalAgent.maxSockets = 10;

/* Paths */
var rootPath = 'static/';
var styleDirectory = 'style';
var htmlDirectory = 'html';
var mediaDirectory = 'media';
var javascriptDirectory = 'js';

/* Control */
var getRedirectIdsCount = 0;
var getRedirectIdsFinished;

/* Redirects */
var redirectTemplateCode = '<html><head><meta charset="UTF-8" /><title>{{ title }}</title><meta http-equiv="refresh" content="0; URL={{ target }}"></head><body></body></html>';
var redirectTemplate = swig.compile( redirectTemplateCode );

/* Global variables */
var withCategories = false;
var withMedias = true;
var mediaRegex = /^(\d+px-|)(.+?)(\.[A-Za-z0-9]{2,6})(\.[A-Za-z0-9]{2,6}|)$/;

/* Content specific */
var cssClassBlackList = [ 'noprint', 'ambox', 'stub', 'topicon', 'magnify' ];
var cssClassBlackListIfNoLink = [ 'mainarticle', 'seealso', 'dablink', 'rellink' ];
var cssClassCallsBlackList = [ 'plainlinks' ];
var idBlackList = [ 'purgelink' ];
var ltr = true;
var autoAlign = ltr ? 'left' : 'right';
var revAutoAlign = ltr ? 'right' : 'left';
var subTitle = "From Wikipedia, the free encyclopedia";

/* Article template */
var templateHtml = function(){/*
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title></title>
    <link rel="stylesheet" href="../../../../../style/style.css" />
    <script src="../../../../../js/head.js"></script>
  </head>
  <body class="mediawiki" style="background-color: white;">
    <div id="content" style="margin: 0px; border-width: 0px;">
      <a id="top"></a>
      <h1 id="firstHeading" class="firstHeading" style="margin-bottom: 0.5em; background-color: white;"></h1>
      <div id="ss" style="font-size: smaller; margin-top: -1em;"></div>
      <div id="bodyContent">
        <div id="mw-content-text" style="padding-top: 1em;">
        </div>
      </div>
    </div>
    <script src="../../../../../js/body.js"></script>
  </body>
</html>
*/}.toString().slice(14,-3);

/* Input variables */
var namespaces = {};
var articleIds = {};
var redirectIds = {};
var mediaIds = {};
var namespaceIds = {};

var parsoidUrl = 'http://parsoid.wmflabs.org/ko/';
var hostUrl = 'http://ko.wikipedia.org/';
var webUrl = hostUrl + 'wiki/';
var apiUrl = hostUrl + 'w/api.php?';

/* Footer */
var footerTemplateCode = '<div style="clear:both; background-image:linear-gradient(180deg, #E8E8E8, white); border-top: dashed 2px #AAAAAA; padding: 0.5em 0.5em 2em 0.5em; margin-top: 1em;">This article is issued from <a class="external text" href="{{ webUrl }}{{ articleId }}">Wikipedia</a>. The text is available under the <a class="external text" href="http://creativecommons.org/licenses/by-sa/3.0/">Creative Commons Attribution/Share Alike</a>; additional terms may apply for the media files.</div>';

/* Initialization */
getNamespaces();
getMainPage();
getSubTitle();
createDirectories();
saveJavascript();
saveStylesheet();
saveFavicon();

/* Get content */
async.series([
	      /* Retrieve the article and redirect Ids */
	      function( finished ) { getArticleIds( finished ) }, 
	      function( finished ) { getRedirectIds( finished ) },

	      /* Save to the disk */
	      function( finished ) { saveArticles( finished ) },
	      function( finished ) { saveRedirects( finished ) }
	      ]);

function saveArticles( finished ) {
    console.log("Saving articles...");
    async.eachLimit(Object.keys(articleIds), 10, saveArticlesCallback, function( err ) {
	if (err) {
	    console.error( 'Error in saveArticles callback: ' + err );
	}
    });
    finished();
}

function saveArticlesCallback( articleId, finished ) {
   var articlePath = getArticlePath( articleId );
   fs.exists( articlePath, function (exists) {
       if ( exists ) {
           console.info( articleId + ' already downloaded at ' + articlePath );
	   finished();
       } else {
           var articleUrl = parsoidUrl + articleId;
           console.info( 'Downloading article from ' + articleUrl + ' at ' + articlePath + '...' );
           loadUrlAsync( articleUrl, function( html, articleId ) {
	       saveArticle( html, articleId );
	       finished();
           }, articleId);
       }
   });
}

function saveRedirects( finished ) {
    console.log( 'Saving redirects...' );
    async.eachLimit( Object.keys( redirectIds ), 10, saveRedirectsCallback, function( err ) {
	if (err) {
	    console.error( 'Error in saveRedirects callback: ' + err );
	}
    });
    finished();
}

function saveRedirectsCallback( redirectId, finished ) {
    var html = redirectTemplate( { title: redirectId.replace( /_/g, ' ' ), 
				   target : getArticleUrl( redirectIds[ redirectId ] ) } );
    writeFile( html, getArticlePath( redirectId ), finished );
}

function saveArticle( html, articleId ) {
    console.info( 'Parsing HTML/RDF of ' + articleId + '...' );
    var parsoidDoc = domino.createDocument( html );

    /* Go through gallerybox */
    var galleryboxes = parsoidDoc.getElementsByClassName( 'gallerybox' );
    for ( var i = 0; i < galleryboxes.length ; i++ ) {
	if ( ! galleryboxes[i].getElementsByClassName( 'thumb' ).length ) {
	    deleteNode( galleryboxes[i] );
	}
    }

    /* Remove useless DOM nodes without children */
    var tagNames = [ 'li', 'span' ];
    tagNames.map( function( tagName ) {
	    var nodes = parsoidDoc.getElementsByTagName( tagName );
	    for ( var i = 0; i < nodes.length ; i++ ) {
	        if ( ! nodes[i].innerHTML ) {
		    deleteNode( nodes[i] );
		}
	    };
    });

    /* Remove useless input nodes */
    var inputNodes = parsoidDoc.getElementsByTagName( 'input' );
    for ( var i = 0; i < inputNodes.length ; i++ ) {
	deleteNode( inputNodes[i] );
    }

    /* Go through all images */
    var imgs = parsoidDoc.getElementsByTagName( 'img' );
    for ( var i = 0; i < imgs.length ; i++ ) {
	var img = imgs[i];
	var src = getFullUrl( img.getAttribute( 'src' ) );
	var filename = decodeURIComponent( pathParser.basename( urlParser.parse( src ).pathname ) );

	/* Download image */
	downloadMedia( src, filename );

	/* Change image source attribute to point to the local image */
	img.setAttribute( 'src', getMediaUrl( filename ) );
	
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
	var href = a.getAttribute( 'href' );

	if ( rel ) {
	    /* Add 'external' class to external links */
	    if ( rel.substring( 0, 10 ) === 'mw:ExtLink' || rel === 'mw:WikiLink/Interwiki' ) {
		a.setAttribute( 'class', concatenateToAttribute( a.getAttribute( 'class'), 'external' ) );
	    }

	    if ( ! href ) {
		console.log(a.outerHTML);
		//		break;
		process.exit(1);
	    }

	    /* Rewrite external links starting with // */
	    if ( rel.substring( 0, 10 ) === 'mw:ExtLink' ) {
		if ( href.substring( 0, 1 ) === '/' ) {
		    a.setAttribute( 'href', getFullUrl( href ) );
		}
	    }

	    /* Remove internal links pointing to no mirrored articles */
	    else if ( rel.substring( 0, 11 ) === 'mw:WikiLink' ) {
		var targetId = decodeURIComponent( href.replace(/^\.\//, '') );
		if ( isMirrored( targetId ) ) {
		    a.setAttribute( 'href', getArticleUrl( targetId ) );
		} else {
		    while ( a.firstChild ) {
			a.parentNode.insertBefore( a.firstChild, a);
		    }
		    a.parentNode.removeChild( a );
		}
	    }
	} else {
	    if ( href.indexOf( '/wiki/' ) != -1 ) {
		var targetId = decodeURIComponent( href.replace(/^\/wiki\//, '') );
		if ( isMirrored( targetId ) ) {
		    a.setAttribute( 'href', getArticleUrl( targetId ) );
		} else {
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
		sup.id = span.id;
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
	var figureClass = figure.getAttribute( 'class' ) || '';
	var figureTypeof = figure.getAttribute( 'typeof' );
	var image = figure.getElementsByTagName( 'img' )[0];
	var imageWidth = parseInt( image.getAttribute( 'width' ) );

	if ( figureTypeof.indexOf( 'mw:Image/Thumb' ) >= 0 ) {
	    var description = figure.getElementsByTagName( 'figcaption' )[0];
	    
	    var thumbDiv = parsoidDoc.createElement( 'div' );
	    thumbDiv.setAttribute
	    thumbDiv.setAttribute( 'class', 'thumb' );
	    if ( figureClass.search( 'mw-halign-right' ) >= 0 ) {
		thumbDiv.setAttribute( 'class', concatenateToAttribute( thumbDiv.getAttribute( 'class' ), 'tright' ) );
	    } else if ( figureClass.search( 'mw-halign-left' ) >= 0 ) {
		thumbDiv.setAttribute( 'class', concatenateToAttribute( thumbDiv.getAttribute( 'class' ), 'tleft' ) );
	    } else if ( figureClass.search( 'mw-halign-center' ) >= 0 ) {
		thumbDiv.setAttribute( 'class', concatenateToAttribute( thumbDiv.getAttribute( 'class' ), 'tnone center' ) );
	    } else {
		thumbDiv.setAttribute( 'class', concatenateToAttribute( thumbDiv.getAttribute( 'class' ), 't' + revAutoAlign ) );
	    }
	    
	    var thumbinnerDiv = parsoidDoc.createElement( 'div' );
	    thumbinnerDiv.setAttribute( 'class', 'thumbinner' );
	    thumbinnerDiv.setAttribute( 'style', 'width:' + ( imageWidth + 2) + 'px' );
	    
	    var thumbcaptionDiv = parsoidDoc.createElement( 'div' );
	    thumbcaptionDiv.setAttribute( 'class', 'thumbcaption' );
	    thumbcaptionDiv.setAttribute( 'style', 'text-align: ' + autoAlign );
	    if ( description ) {
		thumbcaptionDiv.innerHTML = description.innerHTML
	    }
	    
	    thumbinnerDiv.appendChild( image );
	    thumbinnerDiv.appendChild( thumbcaptionDiv );
	    thumbDiv.appendChild( thumbinnerDiv );
	    
	    figure.parentNode.replaceChild(thumbDiv, figure);
	} else if ( figureTypeof.indexOf( 'mw:Image' ) >= 0 ) {
	    var div = parsoidDoc.createElement( 'div' );
	    if ( figureClass.search( 'mw-halign-right' ) >= 0 ) {
		div.setAttribute( 'class', concatenateToAttribute( div.getAttribute( 'class' ), 'floatright' ) );
	    } else if ( figureClass.search( 'mw-halign-left' ) >= 0 ) {
		div.setAttribute( 'class', concatenateToAttribute( div.getAttribute( 'class' ), 'floatleft' ) );
	    } else if ( figureClass.search( 'mw-halign-center' ) >= 0 ) {
		div.setAttribute( 'class', concatenateToAttribute( div.getAttribute( 'class' ), ' center' ) );
	    } else {
		div.setAttribute( 'class', concatenateToAttribute( div.getAttribute( 'class' ), 'float' + revAutoAlign ) );
	    }
	    div.appendChild( image );
	    figure.parentNode.replaceChild(div, figure);
	}
    }

    /* Remove element with id in the blacklist */
    idBlackList.map( function( id ) {
	var node = parsoidDoc.getElementById( id );
	if (node) {
	    deleteNode( node );
	}
    });

    /* Remove element with black listed CSS classes */
    cssClassBlackList.map( function( classname ) {
	var nodes = parsoidDoc.getElementsByClassName( classname );
	for ( var i = 0; i < nodes.length ; i++ ) {
	    deleteNode( nodes[i] );
	}
    });

    /* Remove element with black listed CSS classes and no link */
    cssClassBlackListIfNoLink.map( function( classname ) {
	var nodes = parsoidDoc.getElementsByClassName( classname );
	for ( var i = 0; i < nodes.length ; i++ ) {
	    if ( nodes[i].getElementsByTagName( 'a' ).length === 0 ) {
		deleteNode(nodes[i]);
	    }
	}
    });

    /* Create final document by merging template and parsoid documents */
    var doc = domino.createDocument( templateHtml );
    var contentNode = doc.getElementById( 'mw-content-text' );
    contentNode.innerHTML = parsoidDoc.getElementsByTagName( 'body' )[0].innerHTML;
    var contentTitleNode = doc.getElementById( 'firstHeading' );
    contentTitleNode.innerHTML = articleId.replace( /_/g, ' ' );
    var titleNode = doc.getElementsByTagName( 'title' )[0];
    titleNode.innerHTML = articleId.replace( /_/g, ' ' );

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

    /* Set sub-title */
    doc.getElementById( 'ss' ).innerHTML = subTitle;

    /* Append footer node */
    doc.getElementById( 'mw-content-text' ).appendChild( getFooterNode( doc, articleId ) );

    /* Write the static html file */
    writeFile( doc.documentElement.outerHTML, getArticlePath( articleId ) );

    /* Clean memory */
    parsoidDoc = undefined;
    doc = undefined;
}

function isMirrored( id ) {
    var namespaceNumber = 0;

    if ( id.indexOf(':') >= 0 ) {
	var tmpNamespace = id.substring( 0, id.indexOf(':') ).replace( / /g, '_');
	var tmpNamespaceNumber = namespaces[tmpNamespace];
	if ( tmpNamespaceNumber && tmpNamespaceNumber in namespaceIds ) {
	    return true;
	}
    }
    
    return ( id in articleIds || id in redirectIds );
}

/* Grab and concatenate javascript files */
function saveJavascript() {
    console.info( 'Creating javascript...' );
    
    jsdom.defaultDocumentFeatures = {
	FetchExternalResources   : ['script'],
	ProcessExternalResources : ['script'],
	MutationEvents           : '2.0',
    }

    var html = loadUrlSync( webUrl );
    html = html.replace( '<head>', '<head><base href="' + hostUrl + '" />');
    var window = jsdom.jsdom( html ).createWindow();
    
    window.addEventListener('load', function () {
      var nodeNames = [ 'head', 'body' ];
      nodeNames.map( function( nodeName ) {
        var node = window.document.getElementsByTagName( nodeName )[0];
	var scripts = node.getElementsByTagName( 'script' );
	var javascriptPath = rootPath + javascriptDirectory + '/' + nodeName + '.js';
	
	fs.unlink( javascriptPath, function() {} );
	for ( var i = 0; i < scripts.length ; i++ ) {
	  var script = scripts[i];
	  var url = script.getAttribute( 'src' );
	  
	  if ( url ) {
	    url = getFullUrl( url );
	    console.info( 'Downloading javascript from ' + url );
	    // var body = loadUrlSync( url ).replace( '"//', '"http://' );
	    var body = loadUrlSync( url );
	    
	    fs.appendFile( javascriptPath, '\n' + body + '\n', function (err) {} );
	  } else {
	      fs.appendFile( javascriptPath, '\n' + script.innerHTML + '\n', function (err) {} );
	  }
	}
    });
   });
}

/* Grab and concatenate stylesheet files */
function saveStylesheet() {
    console.info( 'Creating stylesheet...' );
    var stylePath = rootPath + styleDirectory + '/style.css';
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
			    downloadFile(url, rootPath + styleDirectory + '/' +filename );
			}
		    }
		    
		    fs.appendFile( stylePath, rewrittenCss, function (err) {} );
		});
	    }
	}
    });
}

/* Get ids */
function getArticleIds( finished ) {
    var next = "";
    var url;
    do {
	console.info( 'Getting article ids' + ( next ? ' (from ' + next + ')' : '' ) + '...' );
	url = apiUrl + 'action=query&generator=allpages&gapfilterredir=nonredirects&gaplimit=500&gapnamespace=0&format=json&gapcontinue=' + encodeURIComponent( next );
	var body = loadUrlSync( url );
	var entries = JSON.parse( body )['query']['pages'];
	Object.keys(entries).map( function( key ) {
	    var entry = entries[key];
	    articleIds[entry['title'].replace( / /g, '_' )] = undefined;
	});
	next = JSON.parse( body )['query-continue'] ? JSON.parse( body )['query-continue']['allpages']['gapcontinue'] : undefined;
    } while ( next );
    finished();
}

function getRedirectIds( finished ) {
    console.log("Getting redirect ids...");
    getRedirectIdsCount = Object.keys(articleIds).length;
    getRedirectIdsFinished = finished;
    async.eachLimit( Object.keys(articleIds), 10, getRedirectIdsCallback, function( err ) {
	if (err) {
            console.error( 'Error in getRedirectIds callback: ' + err );
	}
    });
}

function getRedirectIdsCallback( articleId, finished ) { 
    var url = apiUrl + 'action=query&list=backlinks&blfilterredir=redirects&bllimit=500&format=json&bltitle=' + encodeURIComponent( articleId );
    getRedirectIdsCount -= 1;
    loadUrlAsync( url, function( body, articleId ) {
        console.info( 'Getting redirects for article ' + articleId + '...' );
	var entries = JSON.parse( body )['query']['backlinks'];
	entries.map( function( entry ) {
	    redirectIds[entry['title'].replace( / /g, '_' )] = articleId;
	});
	finished();
	if (!getRedirectIdsCount) {
	    getRedirectIdsFinished();
	}
    }, articleId);
}

/* Create directories for static files */
function createDirectories() {
    console.info( 'Creating directories at \'' + rootPath + '\'...' );
    createDirectory( rootPath );
    createDirectory( rootPath + styleDirectory );
    createDirectory( rootPath + htmlDirectory );
    createDirectory( rootPath + mediaDirectory );
    createDirectory( rootPath + javascriptDirectory );
}

function createDirectory( path ) {
    try {
	fs.mkdirSync( path );
    } catch ( error ) {
	fs.exists( path, function ( exists ) {
	    if ( ! ( exists && fs.lstatSync( path ).isDirectory() ) ) {
		console.error( 'Unable to create directory \'' + path + '\'' );
		process.exit( 1 );
	    }
	});
    }
}
    
function createDirectoryRecursively( path, position ) {
    position = position || 0;
    var parts = pathParser.normalize( path ).split( '/' );
 
    if ( position >= parts.length ) {
	return true;
    }
 
    createDirectory( parts.slice( 0, position + 1 ).join( '/' ) );
    createDirectoryRecursively( path, position + 1 );
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

function getFooterNode( doc, articleId ) {
    var escapedArticleId = encodeURIComponent( articleId );
    var div = doc.createElement( 'div' );
    var tpl = swig.compile( footerTemplateCode );
    div.innerHTML = tpl({ articleId: escapedArticleId, webUrl: webUrl });
    return div;
}

function writeFile( data, path, callback ) {
    console.info( 'Writing ' + path + '...' );
    
    if ( pathParser.dirname( path ).indexOf('./') >= 0 ) {
	console.error( 'Wrong path ' + path );
	process.exit( 1 );
    }

    createDirectoryRecursively( pathParser.dirname( path ) );
    fs.writeFile( path, data, function( error ) {
	if ( error ) {
	    throw error;
	    process.exit( 1 );
	} else {
	    if (callback) {
		callback();
	    }
	}
    });
}

function loadUrlSync( url, callback ) {
    var tryCount = 0;
    do {
	try {
	    var req = httpsync.get({ url : url });
	    var res = req.end();
	    if ( res.headers.location ) {
		console.info( "Redirect detected, load " + res.headers.location );
		return loadUrlSync( res.headers.location, callback );
	    } else {
		if ( callback ) {
		    callback( res.data.toString('utf8') );
		    break;
		} else {
		    return res.data.toString('utf8');
		}
	    }
	} catch ( error ) {
	    if ( tryCount++ > 5 ) {
		console.error( 'Unable to retrieve ' + url );
		console.error( error );
		process.exit( 1 );
	    }
	}
    } while ( true );
}

function loadUrlAsync( url, callback, var1, var2, var3 ) {
    var tryCount = 0;
    var nok = true;
    var data;

    async.whilst(
	function() {
	    return nok;
	},
	function( finished ) {
	    tryCount += 1;
	    var request = http.get( url, function( response ) {
		data = '';
		response.setEncoding( 'utf8' );
		
		response.on( 'data', function ( chunk ) {
		    data += chunk;
		});
		response.on( 'end', function () {
		    nok = false;
		    finished();
		});
	    }).on( 'error', function( error ) {
		finished( error );
	    });
	    request.end();
	},
	function( error ) {
	    if ( error ) {
		console.error( 'Error (' + tryCount + ') by retrieving from url ' + url );
		console.error( error )
		if ( tryCount > 5 ) {
		    console.error( 'Unable to retrieve ' + url + ' at ' + path );
		    process.exit( 1 );
		}
	    } else {
		callback( data, var1, var2, var3 );		
	    }
	}
    );
}

function downloadMedia( url, filename ) {
    var parts = mediaRegex.exec( filename );
    var width = parts[1].replace( /px\-/g, '' ) || 9999999;
    var filenameBase = parts[2] + parts[3] + ( parts[4] || '' );

    if ( mediaIds[ filenameBase ] && parseInt( mediaIds[ filenameBase ] ) >=  parseInt( width ) ) {
	return;
    } else {
	mediaIds[ filenameBase ] = width;
    }

    downloadFile( url, getMediaPath( filename ), true );
}

function downloadFile( url, path, force ) {
    fs.exists( path, function ( exists ) {
	if ( exists && !force ) {
	    console.info( path + ' already downloaded, download will be skipped.' );
	} else {
	    url = url.replace( /^https\:\/\//, 'http://' );
	    console.info( 'Downloading ' + url + ' at ' + path + '...' );

	    createDirectoryRecursively( pathParser.dirname( path ) );

	    var file = fs.createWriteStream( path );
	    var nok = true;
	    var tryCount = 0;

	    async.whilst(
		function() {
		    return nok;
		},
		function( finished ) {
		    tryCount += 1;
		    var request = http.get( url, function( response ) {
			response.pipe( file );
			nok = false;
			finished();
		    });
		    request.on( 'error', function( error ) {
			finished( error );
		    });
		    request.end();
		},
		function( error ) {
		    if ( error ) {
			console.error( 'Error (' + tryCount + ') in downloading file from url ' + url );
			console.error( error )
			if ( tryCount > 5 ) {
			    console.error( 'Unable to download file ' + url + ' at ' + path );
			    process.exit( 1 );
			}
		    }
		}
	    );
	}			    
    });
}

/* Internal path/url functions */
function getMediaUrl( filename ) {
    return '../../../../../' + getMediaBase( filename );
}

function getMediaPath( filename ) {
    return rootPath + getMediaBase( filename );
}

function getMediaBase( filename ) {
    var parts = mediaRegex.exec( filename );
    var root = parts[2];

    if ( !root ) {
	console.error( 'Unable to parse filename \'' + filename + '\'' );
	process.exit( 1 );
    }

    return mediaDirectory + '/' + ( root[0] || '_' ) + '/' + ( root[1] || '_' ) + '/' + 
	( root[2] || '_' ) + '/' + ( root[3] || '_' ) + '/' + parts[2] + parts[3] + ( parts[4] || '' );
; 
}

function getArticleUrl( articleId ) {
    return '../../../../../' + getArticleBase( articleId );
}

function getArticlePath( articleId ) {
    return rootPath + getArticleBase( articleId );
}

function getArticleBase( articleId ) {
    var filename = articleId.replace( /\//g, '_' );
    var dirBase = filename.replace( /\./g, '_');
    return htmlDirectory + '/' + ( dirBase[0] || '_' ) + '/' + ( dirBase[1] || '_' ) + '/' + 
	( dirBase[2] || '_' ) + '/' + ( dirBase[3] || '_' ) + '/' + filename + '.html';
}

function getSubTitle() {
    console.info( 'Getting sub-title...' );
    var html = loadUrlSync( webUrl );
    var doc = domino.createDocument( html );
    var subTitleNode = doc.getElementById( 'siteSub' );
    subTitle = subTitleNode.innerHTML;
}

function saveFavicon() {
    console.info( 'Saving favicon.png...' );
    downloadFile( 'http://sourceforge.net/p/kiwix/tools/ci/master/tree/dumping_tools/data/wikipedia-icon-48x48.png?format=raw', rootPath + mediaDirectory + '/favicon.png' );
}

function getMainPage() {
    loadUrlSync( webUrl, function( body ) {
	var mainPageRegex = /\"wgPageName\"\:\"(.*?)\"/;
	var parts = mainPageRegex.exec( body );
	if ( parts[1] ) {
	    var html = redirectTemplate( { title:  parts[1].replace( /_/g, ' ' ), target : '../' + getArticleBase( parts[1] ) } );
	    writeFile( html, rootPath + htmlDirectory + '/index.html' );
	    articleIds[ parts[1] ] = undefined;
	} else {
	    console.error( 'Unable to get the main page' );
	    process.exit( 1 );
	};
    });
}

function getNamespaces() {
    var url = apiUrl + 'action=query&meta=siteinfo&siprop=namespaces|namespacealiases&format=json';
    var body = loadUrlSync( url );
    var types = [ 'namespaces', 'namespacealiases'];
    types.map( function( type ) {
	var entries = JSON.parse( body )['query'][type];
	Object.keys(entries).map( function( key ) {
	   var entry = entries[key];
	   var name = entry['*'].replace( / /g, '_');
	   if ( name ) {
	       var number =  entry['id'];
	       namespaces[ lcFirst( name ) ] = number;
	       namespaces[ ucFirst( name ) ] = number;

	       var canonical = entry['canonical'] ? entry['canonical'].replace( / /g, '_' ) : '';
	       if ( canonical ) {
		   namespaces[ lcFirst( canonical ) ] = number;
		   namespaces[ ucFirst( canonical ) ] = number;
	       }
	   }
        });
    });
}

function lcFirst( str ) {
    str += '';
    var f = str.charAt( 0 ).toLowerCase();
    return f + str.substr( 1 );
}

function ucFirst( str ) {
    str += '';
    var f = str.charAt( 0 ).toUpperCase();
    return f + str.substr( 1 );
}

/* Others */
function addFooter( finished ) {
    console.log("Adding footers...");
    async.eachLimit(Object.keys(articleIds), 10, addFooterCallback, function( err ) {
	if (err) {
	    console.error( 'Error in adding footer callback: ' + err );
	}
    });

    finished();
}

function addFooterCallback( articleId, finished ) {
   var articlePath = getArticlePath( articleId );
    console.log( 'Adding footer to ' + articlePath );
    fs.readFile(articlePath, 'utf8',  function (err,data) {
	if ( err ) {
	    console.log( err );
	    return finished();
	}
	var doc = domino.createDocument( data );
	doc.getElementById( 'mw-content-text' ).appendChild( getFooterNode( doc, articleId ) );
        writeFile( doc.documentElement.outerHTML, articlePath );
	finished();
    });
}
