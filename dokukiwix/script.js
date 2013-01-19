/**
 * Javascript for dokukiwix manager plugin
 *
 * @author Andreas Gohr <andi@splitbrain.org>
 * @author Symon Bent <hendrybadao@gmail.com>
 *     Complete rewrite using jQuery and revealing module pattern
 *     Separate update and rebuild options
 */

var plugin_dokukiwix = (function() {

    // public methods/properties
    var pub = {};

    // private vars
    var pages = null,
        page =  null,
        url =  null,
        done =  1,
        count = 0,
        $msg = null,
        $buttons = null,
        lang = null;
        force = '';

    /**
     * initialize everything
     */
    pub.init = function() {
        $msg = jQuery('#plugin__dokukiwix_msg');
        if( ! $msg) return;

        lang = LANG.plugins.dokukiwix;
        url = DOKU_BASE + 'lib/plugins/dokukiwix/ajax.php';

        $buttons = jQuery('#plugin__dokukiwix_buttons');

        // init interface events
        jQuery('#plugin__dokukiwix_rebuild').click(pub.build);
    };

    /**
     * Gives textual feedback
     */
    var message = function(text) {
        if (text.charAt(0) !== '<') {
            text = '<p>' + text + '</p>'
        }
        $msg.html(text);
    };

    /**
     * Starts the dumping of a page.
     */
    var dump = function() {
        if (page) {
            jQuery.post(url, 'call=dumppage&page=' + encodeURI(page), function(response) {
                if (response !== 'true') {
                    window.setTimeout(function() {
                        message(response);
                        abort();
                    }, 5000);   
                } else {
                    var wait = 250;
                    // next page from queue
                    page = pages.shift();
                    done++;
                    
                    var msg = (response !== 'true') ? lang.notindexed : lang.indexed;
                    status = '<p class="status">' + msg + '</p>';
                    message('<p>' + lang.dumping + ' ' + done + '/' + count + '</p><p class="name">' + page + '</p>' + status);
                    // next dump run
                    window.setTimeout(dump, wait);
                }
            });
        } else {
            finish();
        }
    };

    var removeLock = function() {
        jQuery.post(url, 'call=removeLock', function(response) {
            if (response !== 'true') {
                message(response);
            }
        });
    };

    var abord = function() {
        throbber_off();
        message(lang.aborted);
        window.setTimeout(function() {
            message('');
            $buttons.show('slow');
        }, 5000);
    };

    var finish = function() {
        removeLock();
        throbber_off();
        message(lang.done);
        window.setTimeout(function() {
            message('');
            $buttons.show('slow');
        }, 5000);
    };
    /**
     * Cleans the index (ready for complete rebuild)
     */
    var prepare = function() {
        message(lang.prepare);
        prepared = false;
        jQuery.ajaxSetup({async: false});
        jQuery.post(url, 'call=prepare', function(response) {
            if (response !== 'true') {
                message(response);
                if (!confirm("Warning: Dokukiwix is locked. This may mean that another instance is already running. Proceed anyway? (this will stop the other instance if any)")) {
                } else {
                    removeLock();
                    return prepare();
                }
            } else {
                prepared = true;
            }
        });
        jQuery.ajaxSetup({async: true});
        return prepared;
    };

    /**
     * Starts the dump process
     */
    pub.build = function() {
        done = 1;
        $buttons.hide('slow');
        throbber_on();
        if (prepare()) {
            message(lang.finding);
            jQuery.post(url, 'call=pagelist', function(response) {
                if (response !== 'true') {
                    pages = response.split("\n");
                    count = pages.length;
                    message(lang.pages.replace(/%d/, pages.length));
                    page = pages.shift();
                    window.setTimeout(dump, 1000);
                } else {
                    finish();
                }
            });
        } else {
            abord();
        }
    };
                        
    /**
     * add a throbber image
     */
    var throbber_on = function() {
        $msg.addClass('updating');
    };

    /**
     * Stop the throbber
     */
    var throbber_off = function() {
        $msg.removeClass('updating');
    };

    // return only public methods/properties
    return pub;
})();

jQuery(function() {
    plugin_dokukiwix.init();
});