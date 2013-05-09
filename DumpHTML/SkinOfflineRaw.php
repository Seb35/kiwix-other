<?php

/**
 * Default skin for HTML dumps, based on MonoBook.php
 */

if( !defined( 'MEDIAWIKI' ) )
	die( 1 );

/**
 * Inherit main code from SkinTemplate, set the CSS and template filter.
 * @todo document
 * @ingroup Skins
 */
class SkinOfflineRaw extends SkinTemplate {
	var $template  = 'SkinOfflineRawTemplate';

	function setupTemplate( $className, $repository = false, $cache_dir = false ) {
		global $wgFavicon, $wgStylePath;
		$tpl = SkinTemplate::setupTemplate( $className, $repository, $cache_dir );
		$tpl->set( 'skinpath', "$wgStylePath/offline" );
		$tpl->set( 'favicon', $wgFavicon );
		return $tpl;
	}

	function buildSidebar() {
		$sections = SkinTemplate::buildSidebar();
		$badMessages = array( 'recentchanges-url', 'randompage-url' );
		$badUrls = array();
		foreach ( $badMessages as $msg ) {
			$badUrls[] = self::makeInternalOrExternalUrl( wfMsgForContent( $msg ) );
		}
		foreach ( $sections as $heading => $section ) {
			if (!is_array($section)) {
				// A raw HTML chunk, such as provided by Collection ext.
				// Just ignore these so they don't explode.
				unset( $sections[$heading] );
				continue;
			}
			foreach ( $section as $index => $link ) {
				if ( in_array( $link['href'], $badUrls ) ) {
					unset( $sections[$heading][$index] );
				}
			}
		}
		return $sections;
	}

	function buildContentActionUrls( $content_navigation ) {
		global $wgHTMLDump;

		$content_actions = array();
		$nskey = $this->getNameSpaceKey();
		$content_actions[$nskey] = $this->tabAction(
			$this->getTitle()->getSubjectPage(),
			$nskey,
			!$this->getTitle()->isTalkPage() );

		if( $this->getTitle()->canTalk() ) {
			$content_actions['talk'] = $this->tabAction(
				$this->getTitle()->getTalkPage(),
				'talk',
				$this->getTitle()->isTalkPage(),
				'',
				true);
		}

		if ( isset( $wgHTMLDump ) ) {
			$content_actions['current'] = array(
				'text' => wfMsg( 'currentrev' ),
				'href' => str_replace( '$1', wfUrlencode( $this->getTitle()->getPrefixedDBkey() ),
					$wgHTMLDump->oldArticlePath ),
				'class' => false
			);
		}
		return $content_actions;
	}

	function makeBrokenLinkObj( &$nt, $text = '', $query = '', $trail = '', $prefix = '' ) {
		if ( !isset( $nt ) ) {
			return "<!-- ERROR -->{$prefix}{$text}{$trail}";
		}

		if ( $nt->getNamespace() == NS_CATEGORY ) {
			# Determine if the category has any articles in it
			$dbr = wfGetDB( DB_SLAVE );
			$hasMembers = $dbr->selectField( 'categorylinks', '1', 
				array( 'cl_to' => $nt->getDBkey() ), __METHOD__ );
			if ( $hasMembers ) {
				return $this->makeKnownLinkObj( $nt, $text, $query, $trail, $prefix );
			}
		}

		if ( $text == '' ) {
			$text = $nt->getPrefixedText();
		}
		return $prefix . $text . $trail;
	}

	function printSource() {
		return '';
	}
}

/**
 * @todo document
 * @ingroup Skins
 */
class SkinOfflineRawTemplate extends QuickTemplate {
	/**
	 * Template filter callback for MonoBook skin.
	 * Takes an associative array of data set from a SkinTemplate-based
	 * class, and a wrapper for MediaWiki's localization database, and
	 * outputs a formatted page.
	 *
	 * @private
	 */
	 
	function executeHeader() {
?><!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="<?php $this->text('lang') ?>" lang="<?php $this->text('lang') ?>" dir="<?php $this->text('dir') ?>">
  <head>
    <meta http-equiv="Content-Type" content="<?php $this->text('mimetype') ?>; charset=<?php $this->text('charset') ?>" />
	<!-- headlinks removed -->
	<link rel="shortcut icon" href="<?php $this->text('favicon'); ?>"/>
    <title><?php $this->text('pagetitle') ?></title>
    <style type="text/css">/*<![CDATA[*/ @import "<?php $this->text('skinpath') ?>/main.css"; /*]]>*/</style>
    <link rel="stylesheet" type="text/css" media="print" href="<?php $this->text('stylepath') ?>/common/commonPrint.css" />
    <!--[if lt IE 5.5000]><style type="text/css">@import "<?php $this->text('stylepath') ?>/<?php $this->text('stylename') ?>/IE50Fixes.css";</style><![endif]-->
    <!--[if IE 5.5000]><style type="text/css">@import "<?php $this->text('stylepath') ?>/<?php $this->text('stylename') ?>/IE55Fixes.css";</style><![endif]-->
    <!--[if IE 6]><style type="text/css">@import "<?php $this->text('stylepath') ?>/<?php $this->text('stylename') ?>/IE60Fixes.css";</style><![endif]-->
    <!--[if IE]><script type="<?php $this->text('jsmimetype') ?>" src="<?php $this->text('stylepath') ?>/common/IEFixes.js"></script>
    <meta http-equiv="imagetoolbar" content="no" /><![endif]-->
    <script type="<?php $this->text('jsmimetype') ?>" src="<?php $this->text('stylepath' ) ?>/common/wikibits.js"></script>
    <script type="<?php $this->text('jsmimetype') ?>" src="<?php $this->text('skinpath' ) ?>/md5.js"></script>
    <script type="<?php $this->text('jsmimetype') ?>" src="<?php $this->text('skinpath' ) ?>/utf8.js"></script>
    <script type="<?php $this->text('jsmimetype') ?>" src="<?php $this->text('skinpath' ) ?>/lookup.js"></script>
    <?php if($this->data['jsvarurl'  ]) { ?><script type="<?php $this->text('jsmimetype') ?>" src="<?php $this->text('jsvarurl'  ) ?>"></script><?php } ?>
    <?php if($this->data['pagecss'   ]) { ?><style type="text/css"><?php              $this->html('pagecss'   ) ?></style><?php    } ?>
    <?php if($this->data['usercss'   ]) { ?><style type="text/css"><?php              $this->html('usercss'   ) ?></style><?php    } ?>
    <?php if($this->data['userjs'    ]) { ?><script type="<?php $this->text('jsmimetype') ?>" src="<?php $this->text('userjs'    ) ?>"></script><?php } ?>
    <?php if($this->data['userjsprev']) { ?><script type="<?php $this->text('jsmimetype') ?>"><?php      $this->html('userjsprev') ?></script><?php   } ?>
  </head><?php
	}
	
	function executeContent() { ?>
	  <h1 class="firstHeading"><?php $this->data['displaytitle']!=""?$this->html('title'):$this->text('title') ?></h1>
	  <div id="bodyContent">
	    <h3 id="siteSub"><?php $this->msg('tagline') ?></h3>
	    <div id="contentSub"><?php $this->html('subtitle') ?></div>
	    <?php if($this->data['undelete']) { ?><div id="contentSub"><?php     $this->html('undelete') ?></div><?php } ?>
	    <?php if($this->data['newtalk'] ) { ?><div class="usermessage"><?php $this->html('newtalk')  ?></div><?php } ?>
	    <!-- start content -->
		 <?php $this->html('bodytext');
		 if($this->data['catlinks']) { ?><div id="catlinks"><?php       $this->html('catlinks') ?></div><?php } ?>
	    <!-- end content -->
	    <div class="visualClear"></div>
	  </div><?php
	}

	function executeFooter() { ?>
      <div id="footer">
    <?php if($this->data['poweredbyico']) { ?><div id="f-poweredbyico"><?php $this->html('poweredbyico') ?></div><?php } ?>
	<?php if($this->data['copyrightico']) { ?><div id="f-copyrightico"><?php $this->html('copyrightico') ?></div><?php } ?>
	<ul id="f-list">
	  <?php if($this->data['lastmod'   ]) { ?><li id="f-lastmod"><?php    $this->html('lastmod')    ?></li><?php } ?>
	  <?php if($this->data['numberofwatchingusers' ]) { ?><li id="f-numberofwatchingusers"><?php  $this->html('numberofwatchingusers') ?></li><?php } ?>
	  <?php if($this->data['credits'   ]) { ?><li id="f-credits"><?php    $this->html('credits')    ?></li><?php } ?>
	  <?php if($this->data['copyright' ]) { ?><li id="f-copyright"><?php  $this->html('copyright')  ?></li><?php } ?>
	  <?php if($this->data['about'     ]) { ?><li id="f-about"><?php      $this->html('about')      ?></li><?php } ?>
	  <?php if($this->data['disclaimer']) { ?><li id="f-disclaimer"><?php $this->html('disclaimer') ?></li><?php } ?>
	  <?php if($this->data['tagline']) { ?><li id="f-tagline"><?php echo $this->data['tagline'] ?></li><?php } ?>
	</ul>
      </div><?php
	}

	function execute() {
		wfSuppressWarnings();
		$this->executeHeader();
?>
  <body
    <?php if($this->data['pageclass']) { ?>class="<?php $this->text('pageclass') ?>"<?php } ?>>
	  <a name="top" id="contentTop"></a>
	  <div id="globalWrapper">
	  <div style="margin: 0 1em;"><?php $this->executeContent() ?></div>
	<script type="<?php $this->text('jsmimetype') ?>"> if (window.isMSIE55) fixalpha(); </script>
      <div class="visualClear"></div>
      <?php $this->executeFooter() ?>
    </div>
  </body>
</html>
<?php
		wfRestoreWarnings();
	}

}
