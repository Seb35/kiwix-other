<?php
/**
 * AJAX call handler for dokukiwix plugin
 *
 * @license    GPL 2 (http://www.gnu.org/licenses/gpl.html)
 * @author     Andreas Gohr <andi@splitbrain.org>
 * @author     Yann Hamon <yann@mandragor.org>
 * @author     Emmanuel Engelhart <kelson@kiwix.org>
 */

//fix for Opera XMLHttpRequests
if(!count($_POST) && $HTTP_RAW_POST_DATA){
  parse_str($HTTP_RAW_POST_DATA, $_POST);
}

if(!defined('DOKU_INC')) define('DOKU_INC',realpath(dirname(__FILE__).'/../../../').'/');
if(!defined('DOKU_PLUGIN')) define('DOKU_PLUGIN',DOKU_INC.'lib/plugins/');
require_once(DOKU_INC.'inc/init.php');
require_once(DOKU_INC.'inc/common.php');
require_once(DOKU_INC.'inc/pageutils.php');
require_once(DOKU_INC.'inc/auth.php');
require_once(DOKU_INC.'inc/search.php');
require_once(DOKU_INC.'inc/indexer.php');
require_once(DOKU_INC.'inc/html.php');                                                                                               require_once(DOKU_INC.'inc/template.php');                                                                                           require_once(DOKU_INC.'inc/actions.php');

//close session
session_write_close();

header('Content-Type: text/plain; charset=utf-8');

//we only work for admins!
if (auth_quickaclcheck($conf['start']) < AUTH_ADMIN){
    die('access denied');
}

//call the requested function
$call = 'ajax_'.$_POST['call'];
if (function_exists($call)) {
    $call();
} else {
    print "The called function '".htmlspecialchars($call)."' does not exist!";
}

/**
 * Prepare the static dump
 */
function ajax_prepare(){
    global $conf;
    $today = date('Y-m-d');
    $staticDir = DOKU_INC.$conf['savedir'].'/static/'.$today."/";

    // create output directory
    io_mkdir_p($rootStaticPath);
    
    // acquire a lock
    $lock = $conf['lockdir'] . '/_dokukiwix.lock';
    if (!file_exists($lock) || time()-@filemtime($lock) > 60*5) {
      unlink($lock);
      if ($fp = fopen($lock, 'w+')) {
        fwrite($fp, $today);
        fclose($fp);
      }
    } else {
      print 'dokukiwix is locked.';
      exit;
    }

    // create mandatory directories
    io_mkdir_p($staticDir.'/images/');
    io_mkdir_p($staticDir.'/images/extern/');
    io_mkdir_p($staticDir.'/pages/');
    io_mkdir_p($staticDir.'/css/');

    print 'true';
}

function ajax_removeLock(){
    global $conf;
    $lock = $conf['lockdir'] . '/_dokukiwix.lock';
    unlink($lock);
    print 'true';
}

/**
 * Searches for pages
 *
 * @author Andreas Gohr <andi@splitbrain.org>
 */
function ajax_pagelist(){
    global $conf;
    $data = array();
    search($data,$conf['datadir'], 'search_allpages', array());

    foreach($data as $val) {
        print $val['id']."\n";
    }
}

/**
 * Dump the given page
 */
function ajax_dumppage() {
    global $conf;

    // Check if there is a 'page' argument
    if (!$_POST['page']) {
        print "No page given";
        exit;
    }

    // Check if this is locked
    $lock = $conf['lockdir'].'/_dokukiwix.lock';
    $staticDir = DOKU_INC.$conf['savedir'].'/static/';
    if (!file_exists($lock)) {
      print 'The lock file has been removed! Dumping process must be aborted.';
      return;
    } else {
      $staticDir = $staticDir.file_get_contents($lock).'/';
    }

    // Set page
    global $ID, $ACT;
    $ID = $_POST['page'];
    $ACT = 'show';

    // Set template
    $conf['template'] = 'offline';

    // do the work
    ob_start();
    include(template('main.php'));
    $data = ob_get_contents();
    ob_end_clean();
    
    io_saveFile($staticDir.'pages/'.str_replace(':', '/', $_POST['page']).'.html', $data);

    print 'true';
}

