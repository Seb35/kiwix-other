/**
 * videoDB is responsible for loading
 * and managing the video data from the data.js file.
 */
var videoDB = (function() {
  var ITEMS_PER_PAGE = 40;
  var db = {};
  var data;
  var page = 1;

  /**
   * Load the data with or without an 
   * applied language filter. 
   * The data will be loaded from the json in 
   * the data.js file.
   * @param {language} Language filter that you want
   *                   to apply to the data set. 
   *                   Pass in 'undefined' if you don't 
   *                   want any language filter.
   * @param {callback} This callback will be called 
   *                   when the data is loaded.
   */
  db.loadData = function(language, callback){
    if (typeof language === 'undefined'){
      data = json_data;
    }
    else {

      // Clear the previously loaded data.
      data = [];

      // Iterate through the whole data set and 
      // add the video objects that have the language 
      // that we want to the data array.
      for (i in json_data){
        if (json_data[i].languages.indexOf(language) > -1) {
          data.push(json_data[i]);
        }
      }
    }
    callback();
  }

  /**
   * Get the count pages that we need to set up.
   */
  db.getPageCount = function() {
    return Math.floor(data.length / ITEMS_PER_PAGE);
  }

  /**
   * Move one page forward. 
   * @param {callback} This callback is called when 
   *                   you have to load a new page. 
   */
  db.pageForward = function(callback) {
    var change = false;
    if (page <=  db.getPageCount()) {
      page++;
      change = true;
    }
    callback(change);
  }

  /**
   * Move one page back. 
   * @param {callback} This callback is called when 
   *                   you have to load a new page. 
   */
  db.pageBackwards = function(callback) {
    var change = false;
    if (page != 1) {
      page--;
      change = true;
    }
    callback(change);
  }

  /**
   * Reset the page count to 1.
   */
  db.resetPage = function() {
    page = 1;
  }

  /**
   * Get the current page number.
   */
  db.getPageNumber = function() {
    return page;
  }

  /**
   * Get the video data for a certain page.
   * @param {page} Page number for the page 
   *               you want the data for.
   */
  db.getPage = function(page) {
    var pageStart = (page-1)*ITEMS_PER_PAGE;
    var pageEnd = page*ITEMS_PER_PAGE;
    return data.slice(pageStart, pageEnd);
  }

  return db;

}());
