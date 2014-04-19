
window.onload = function() {
  setupLanguageFilter();
  setupPagination();

  // Load the initial data. 
  // This will display all data without any language filter.
  videoDB.loadData(undefined, function() {
    var data = videoDB.getPage(videoDB.getPageNumber());
    refreshVideos(data);
  });

  refreshPagination();
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
    language = arguments[1].selected;

    // If 'lang-all' is selected the user wants to
    // display videos in all languages. 
    // This removes the previously set filter (if any).
    if (language == 'lang-all') {
      language = undefined;
    }

    // Load the data for the selected language and 
    // generate the video list.
    videoDB.resetPage();
    videoDB.loadData(language, function() {
      var data = videoDB.getPage(videoDB.getPageNumber());
      refreshVideos(data);
      refreshPagination();
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
    videoDB.pageBackwards(function() {
      handlePagination();
    });
  }

  rightArrow.onclick = function() {
    videoDB.pageForward(function(){
      handlePagination();
    });
  }

  function handlePagination(shouldChange){
    var data = videoDB.getPage(videoDB.getPageNumber());
    refreshVideos(data);
    refreshPagination();
    window.scrollTo(0, 0);
  }
}

/**
 * Reset the page text on the pagination widget, 
 * if a new language has been applied.
 */
function refreshPagination() {
  var pageBox = document.getElementsByClassName('pagination')[0];
  var pageCount = videoDB.getPageCount();
  var leftArrow = document.getElementsByClassName('left-arrow')[0];
  var rightArrow = document.getElementsByClassName('right-arrow')[0];
  
  if (pageCount > 1) {
    var pageText = document.getElementsByClassName('pagination-text')[0];
    var pageNumber = videoDB.getPageNumber();
    pageText.innerHTML = 'Page ' + pageNumber + '/' + pageCount;

    if (videoDB.getPageNumber() == 1) {
      leftArrow.style.visibility = 'hidden';
      rightArrow.style.visibility = 'visible';
    } else if (pageNumber == pageCount) {
      leftArrow.style.visibility = 'visible';
      rightArrow.style.visibility = 'hidden';	
    } else {
      leftArrow.style.visibility = 'visible';
      rightArrow.style.visibility = 'visible';	
    }

    pageBox.style.visibility = 'visible';
  } else {
    pageBox.style.visibility = 'hidden';
    leftArrow.style.visibility = 'hidden';
    rightArrow.style.visibility = 'hidden';	
  }
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
      a.className = 'nostyle'

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
