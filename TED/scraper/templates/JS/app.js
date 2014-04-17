
window.onload = function() {
  setupLanguageFilter();
  setupPagination();

  // Load the initial data. 
  // This will display all data without any language filter.
  videoDB.loadData(undefined, function() {
    var data = videoDB.getPage(videoDB.getPageNumber());
    refreshVideos(data);
  });

  return false;
};

/** 
 * Apply a language filter, that is selected by the
 * drop down options <select> menu. 
 * This will then only display items that have
 * subtitles in the selected language.
 */
function setupLanguageFilter() {
  $('.chosen-select').chosen().change(function(){
    resetPaginationText();
    language = arguments[1].selected;

    // If 'lang-all' is selected the user wants to
    // display videos in all languages. 
    // This removes the previously set filter (if any).
    if (language == 'lang-all') {
      language = undefined;
    }

    // Load the data for the selected language and 
    // generate the video list.
    videoDB.loadData(language, function() {
      var data = videoDB.getPage(videoDB.getPageNumber());
      refreshVideos(data);
    });    
  });
}

/**
* This function handles the pagination:
* Clicking the back and forward button.
*/
function setupPagination(){
  var leftArrow = document.getElementsByClassName('left-arrow')[0];
  var rightArrow = document.getElementsByClassName('right-arrow')[0];
  var pageText = document.getElementsByClassName('pagination-text')[0];

  leftArrow.onclick = function() {
    var shouldChange;
    videoDB.pageBackwards(function(change){
      shouldChange = change;
    });
    handlePagination(shouldChange);
  }

  rightArrow.onclick = function() {
    var shouldChange; 
    videoDB.pageForward(function(change){
      shouldChange = change;
    });
    handlePagination(shouldChange);
  }

  function handlePagination(shouldChange){
    if (shouldChange) {
      var data = videoDB.getPage(videoDB.getPageNumber());
      refreshVideos(data);
      pageText.innerHTML = 'Page ' + videoDB.getPageNumber();

      // Scroll back to the top.
      window.scrollTo(0, 0);
    }
  }
}

/**
 * Reset the page text on the pagination widget, 
 * if a new language has been applied.
 */
function resetPaginationText() {
  var pageText = document.getElementsByClassName('pagination-text')[0];
  videoDB.resetPage();
  pageText.innerHTML = 'Page ' + videoDB.getPageNumber();
}

/**
 * Dynamically generate the video item out of 
 * the passed in {pageData} parameter.
 * @param {pageData} Video data for the current page.
 */
function refreshVideos(pageData) {  
    var videoList = document.getElementById('video-items');
    videoList.innerHTML = '';
    
    for (i in pageData) {
      var video = pageData[i];
      var li = document.createElement('li');
      
      var a = document.createElement('a')
      a.href =  video['id']+'/index.html';
      a.style = 'nosytyle'

      var img = document.createElement('img');
      img.src = video['id']+'/thumbnail.jpg'; 

      var author = document.createElement('p');
      author.id = 'author';
      author.innerHTML = video['speaker'];
      
      var title = document.createElement('p');
      title.id = 'title';
      title.innerHTML = video['title'];

      a.appendChild(img);
      a.appendChild(author);
      a.appendChild(title);
      li.appendChild(a);
      videoList.appendChild(li);
    }
}
