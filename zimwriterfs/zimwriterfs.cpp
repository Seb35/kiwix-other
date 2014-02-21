#include <sys/types.h>
#include <sys/stat.h>
#include <assert.h>
#include <getopt.h>
#include <ctime>
#include <stdio.h>
#include <dirent.h>
#include <unistd.h>
#include <pthread.h>

#include <iomanip>
#include <fstream>
#include <iostream>
#include <sstream>
#include <vector>
#include <queue>
#include <map>
#include <cstdio>
#include <cerrno>

#include <magic.h>

#include <zim/writer/zimcreator.h>
#include <zim/blob.h>

#include <gumbo.h>

#define MAX_QUEUE_SIZE 100

#ifdef _WIN32
#define SEPARATOR "\\"
#else
#define SEPARATOR "/"
#endif

bool verboseFlag = false;
std::string language;
std::string creator;
std::string publisher;
std::string title;
std::string description;
std::string welcome;
std::string favicon; 
std::string directoryPath;
std::string zimPath;
zim::writer::ZimCreator zimCreator;
pthread_t directoryVisitor;
pthread_mutex_t filenameQueueMutex;
std::queue<std::string> filenameQueue;
std::queue<std::string> metadataQueue;
pthread_mutex_t directoryVisitorRunningMutex;
bool isDirectoryVisitorRunningFlag = false;
magic_t magic;
std::map<std::string, unsigned int> counters;
std::map<std::string, std::string> urls;
std::map<std::string, std::string> fileMimeTypes;
std::map<std::string, std::string> extMimeTypes;
char *data = NULL;
unsigned int dataSize = 0;

inline std::string getFileContent(const std::string &path) {
  std::ifstream in(path.c_str(), ::std::ios::binary);
  if (in) {
    std::string contents;
    in.seekg(0, std::ios::end);
    contents.resize(in.tellg());
    in.seekg(0, std::ios::beg);
    in.read(&contents[0], contents.size());
    in.close();
    return(contents);
  }
  std::cerr << "Unable to open file at path: " << path << std::endl;
  throw(errno);
}

inline unsigned int getFileSize(const std::string &path) {
  struct stat filestatus;
  stat(path.c_str(), &filestatus);
  return filestatus.st_size;
}    

inline bool fileExists(const std::string &path) {
  bool flag = false;
  std::fstream fin;
  fin.open(path.c_str(), std::ios::in);
  if (fin.is_open()) {
    flag = true;
  }
  fin.close();
  return flag;
}

inline std::string decodeUrl(const std::string &encodedUrl) {
  std::string decodedUrl = encodedUrl;
  std::string::size_type pos = 0;
  char ch;

  while ((pos = decodedUrl.find('%', pos)) != std::string::npos &&
	 pos + 2 < decodedUrl.length()) {
    sscanf(decodedUrl.substr(pos + 1, 2).c_str(), "%x", (unsigned int*)&ch);
    decodedUrl.replace(pos, 3, 1, ch);
    ++pos;
  }

  return decodedUrl;
}

inline std::string removeLastPathElement(const std::string path, const bool removePreSeparator, const bool removePostSeparator) {
  std::string newPath = path;
  size_t offset = newPath.find_last_of(SEPARATOR);
 
  if (removePreSeparator && offset == newPath.length()-1) {
    newPath = newPath.substr(0, offset);
    offset = newPath.find_last_of(SEPARATOR);
  }
  newPath = removePostSeparator ? newPath.substr(0, offset) : newPath.substr(0, offset+1);

  return newPath;
}

/* Warning: the relative path must be with slashes */
inline std::string computeAbsolutePath(const std::string path, const std::string relativePath) {

  /* Add a trailing / to the path if necessary */
  std::string absolutePath = path[path.length()-1] == '/' ? path : removeLastPathElement(path, false, false);

  /* Go through relative path */
  std::vector<std::string> relativePathElements;
  std::stringstream relativePathStream(relativePath);
  std::string relativePathItem;
  while (std::getline(relativePathStream, relativePathItem, '/')) {
    if (relativePathItem == "..") {
      absolutePath = removeLastPathElement(absolutePath, true, false); 
    } else if (!relativePathItem.empty() && relativePathItem != ".") {
      absolutePath += relativePathItem;
      absolutePath += "/";
    }
  }
  
  /* Remove wront trailing / */
  return absolutePath.substr(0, absolutePath.length()-1);
}

void directoryVisitorRunning(bool value) {
  pthread_mutex_lock(&directoryVisitorRunningMutex);
  isDirectoryVisitorRunningFlag = value;
  pthread_mutex_unlock(&directoryVisitorRunningMutex); 
}

bool isDirectoryVisitorRunning() {
  pthread_mutex_lock(&directoryVisitorRunningMutex);
  bool retVal = isDirectoryVisitorRunningFlag;
  pthread_mutex_unlock(&directoryVisitorRunningMutex); 
  return retVal;
}

bool isFilenameQueueEmpty() {
  pthread_mutex_lock(&filenameQueueMutex);
  bool retVal = filenameQueue.empty();
  pthread_mutex_unlock(&filenameQueueMutex);
  return retVal;
}

void pushToFilenameQueue(const std::string &filename) {
  unsigned int wait = 0;
  unsigned int queueSize = 0;

  do {
    usleep(wait);
    pthread_mutex_lock(&filenameQueueMutex);
    unsigned queueSize = filenameQueue.size();
    pthread_mutex_unlock(&filenameQueueMutex);
    wait += 10;
  } while (queueSize > MAX_QUEUE_SIZE);

  pthread_mutex_lock(&filenameQueueMutex);
  filenameQueue.push(filename);
  pthread_mutex_unlock(&filenameQueueMutex); 
}

bool popFromFilenameQueue(std::string &filename) {
  bool retVal = false;
  unsigned int wait = 0;

  do {
    usleep(wait);
    if (!isFilenameQueueEmpty()) {
      pthread_mutex_lock(&filenameQueueMutex);
      filename = filenameQueue.front();
      filenameQueue.pop();
      pthread_mutex_unlock(&filenameQueueMutex);
      retVal = true;
      break;
    } else {
      wait += 10;
    }
  } while (isDirectoryVisitorRunning() || !isFilenameQueueEmpty());

  return retVal;
}

/* Article class */
class Article : public zim::writer::Article {
  protected:
    char ns;
    bool invalid;
    std::string aid;
    std::string url;
    std::string title;
    std::string mimeType;
    std::string redirectAid;
    std::string data;

  public:
    Article() {
      invalid = false;
    }
    explicit Article(const std::string& id);
  
    virtual std::string getAid() const;
    virtual char getNamespace() const;
    virtual std::string getUrl() const;
    virtual bool isInvalid() const;
    virtual std::string getTitle() const;
    virtual bool isRedirect() const;
    virtual std::string getMimeType() const;
    virtual std::string getRedirectAid() const;
    virtual bool shouldCompress() const;
};

class MetadataArticle : public Article {
  public:
  MetadataArticle(std::string &id) {
    if (id == "Favicon") {
      aid = "/-/" + id;
      mimeType="image/png";
      redirectAid = favicon;
      ns = '-';
      url = "favicon";
    } else {
      aid = "/M/" + id;
      mimeType="text/plain";
      ns = 'M';
      url = id;
    }
  }
};

static bool isLocalUrl(const std::string url) {
  if (url.find(":") != std::string::npos) {
    return (!(
	      url.find("://") != std::string::npos ||
	      url.find("//") == 0 ||
	      url.find("tel:") == 0 ||
	      url.find("geo:") == 0
	      ));
  }
  return true;
}

static std::string extractRedirectUrlFromHtml(const GumboVector* head_children) {
  std::string url;
  
  for (int i = 0; i < head_children->length; ++i) {
    GumboNode* child = (GumboNode*)(head_children->data[i]);
    if (child->type == GUMBO_NODE_ELEMENT &&
	child->v.element.tag == GUMBO_TAG_META) {
      GumboAttribute* attribute;
      if (attribute = gumbo_get_attribute(&child->v.element.attributes, "http-equiv")) {
	if (!strcmp(attribute->value, "refresh")) {
	  if (attribute = gumbo_get_attribute(&child->v.element.attributes, "content")) {
	    std::string targetUrl = attribute->value;
	    std::size_t found = targetUrl.find("URL=") != std::string::npos ? targetUrl.find("URL=") : targetUrl.find("url=");
	    if (found!=std::string::npos) {
	      url = targetUrl.substr(found+4);
	    } else {
	      throw "Unable to find the target url from the HTML DOM";
	    }
	  }
	}
      }
    }
  }
  
  return url;
}

static void getLinks(GumboNode* node, std::map<std::string, bool> &links) {
  if (node->type != GUMBO_NODE_ELEMENT) {
    return;
  }

  GumboAttribute* attribute = NULL;
  attribute = gumbo_get_attribute(&node->v.element.attributes, "href");
  if (attribute == NULL) {
    attribute = gumbo_get_attribute(&node->v.element.attributes, "src");
  }

  if (attribute != NULL && isLocalUrl(attribute->value)) {
    links[attribute->value] = true;
  }

  GumboVector* children = &node->v.element.children;
  for (int i = 0; i < children->length; ++i) {
    getLinks(static_cast<GumboNode*>(children->data[i]), links);
  }
}

static void replaceStringInPlace(std::string& subject, const std::string& search,
				 const std::string& replace) {
  size_t pos = 0;
  while ((pos = subject.find(search, pos)) != std::string::npos) {
    subject.replace(pos, search.length(), replace);
    pos += replace.length();
  }
}

static std::string getMimeTypeForFile(const std::string& filename) {
  std::string mimeType;

  /* Try to get the mimeType from the file extension */
  if (filename.find_last_of(".") != std::string::npos) {
    mimeType = filename.substr(filename.find_last_of(".")+1);
    if (extMimeTypes.find(mimeType) != extMimeTypes.end()) {
      return extMimeTypes[mimeType];
    }
  }

  /* Try to get the mimeType from the cache */
  if (fileMimeTypes.find(filename) != fileMimeTypes.end()) {
    return fileMimeTypes[filename];
  }

  /* Try to get the mimeType with libmagic */
  try {
    std::string path = directoryPath + "/" + filename;
    mimeType = std::string(magic_file(magic, path.c_str()));
    if (mimeType.find(";") != std::string::npos) {
      mimeType = mimeType.substr(0, mimeType.find(";"));
    }
    fileMimeTypes[filename] = mimeType;
    return mimeType;
  } catch (...) {
    return "";
  }
}

inline std::string getNamespaceForMimeType(const std::string& mimeType) {
  if (mimeType.find("text") == 0 || mimeType.empty()) {
    if (mimeType.find("text/html") == 0 || mimeType.empty()) {
      return "A";
    } else {
      return "-";
    }
  } else {
    return "I";
  }
}

inline std::string removeLocalTag(const std::string &url) {
  std::size_t found = url.find("#");
  
  if (found != std::string::npos) {
    return url.substr(0, found-1);
  }
  return url;
}

inline std::string computeNewUrl(const std::string &filename) {
  if ( urls.find(filename) == urls.end() ) {
    std::string mimeType = getMimeTypeForFile(removeLocalTag(decodeUrl(filename)));
    std::string url = "/" + getNamespaceForMimeType(mimeType) + "/" + filename;
    urls[filename] = url;
  }
  return urls[filename];
}

Article::Article(const std::string& path) {
  invalid = false;

  /* aid */
  aid = path.substr(directoryPath.size()+1);

  /* url */
  url = aid;

  /* mime-type */
  mimeType = getMimeTypeForFile(aid);
  
  /* namespace */
  ns = getNamespaceForMimeType(mimeType)[0];

  /* HTML specific code */
  if (mimeType.find("text/html") != std::string::npos) {
    std::size_t found;
    std::string html = getFileContent(path);
    GumboOutput* output = gumbo_parse(html.c_str());
    GumboNode* root = output->root;

    /* Search the content of the <title> tag in the HTML */
    assert(root->type == GUMBO_NODE_ELEMENT);
    assert(root->v.element.children.length >= 2);

    const GumboVector* root_children = &root->v.element.children;
    GumboNode* head = NULL;
    for (int i = 0; i < root_children->length; ++i) {
      GumboNode* child = (GumboNode*)(root_children->data[i]);
      if (child->type == GUMBO_NODE_ELEMENT &&
	  child->v.element.tag == GUMBO_TAG_HEAD) {
	head = child;
	break;
      }
    }
    assert(head != NULL);

    GumboVector* head_children = &head->v.element.children;
    for (int i = 0; i < head_children->length; ++i) {
      GumboNode* child = (GumboNode*)(head_children->data[i]);
      if (child->type == GUMBO_NODE_ELEMENT &&
	  child->v.element.tag == GUMBO_TAG_TITLE) {
	if (child->v.element.children.length == 1) {
	  GumboNode* title_text = (GumboNode*)(child->v.element.children.data[0]);
	  assert(title_text->type == GUMBO_NODE_TEXT);
	  title = title_text->v.text.text;
	}
      }
    }

    /* If no title, then compute one from the filename */
    if (title.empty()) {
      found = path.rfind("/");
      if (found!=std::string::npos) {
	title = path.substr(found+1);
	found = title.rfind(".");
	if (found!=std::string::npos) {
	  title = title.substr(0, found);
	}
      } else {
	title = path;
      }
      std::replace(title.begin(), title.end(), '_',  ' ');
    }

    /* Detect if this is a redirection */    
    std::string targetUrl = extractRedirectUrlFromHtml(head_children);
    if (!targetUrl.empty()) {
      redirectAid = computeAbsolutePath(aid, decodeUrl(targetUrl));
      if (!fileExists(directoryPath + "/" + redirectAid)) {
	redirectAid.clear();
	invalid = true;
      }
    }

    gumbo_destroy_output(&kGumboDefaultOptions, output);
  }
}

std::string Article::getAid() const
{
  return aid;
}

bool Article::isInvalid() const
{
  return invalid;
}

char Article::getNamespace() const
{
  return ns;
}

std::string Article::getUrl() const
{
  return url;
}

std::string Article::getTitle() const
{
  return title;
}

bool Article::isRedirect() const
{
  return !redirectAid.empty();
}

std::string Article::getMimeType() const
{
  return mimeType;
}

std::string Article::getRedirectAid() const
{
  return redirectAid;
}

bool Article::shouldCompress() const {
  return (getMimeType().find("text") == 0 ? true : false);
}

/* ArticleSource class */
class ArticleSource : public zim::writer::ArticleSource {
  public:
    explicit ArticleSource();
    virtual const zim::writer::Article* getNextArticle();
    virtual zim::Blob getData(const std::string& aid);
    virtual std::string getMainPage();
};

ArticleSource::ArticleSource() {
}

std::string ArticleSource::getMainPage() {
  return welcome;
}

Article *article = NULL;
const zim::writer::Article* ArticleSource::getNextArticle() {
  std::string path;

  if (article != NULL) {
    delete(article);
  }

  if (!metadataQueue.empty()) {
    path = metadataQueue.front();
    metadataQueue.pop();
    article = new MetadataArticle(path);
  } else if (popFromFilenameQueue(path)) {
    do {
      article = new Article(path);
    } while (article && article->isInvalid() && popFromFilenameQueue(path));
  } else {
    article = NULL;
  }

  /* Count mimetypes */
  if (article != NULL && !article->isRedirect()) {
    std::cout << "Creating entry for " << article->getAid() << std::endl;
    std::string mimeType = article->getMimeType();
    if (counters.find(mimeType) == counters.end()) {
      counters[mimeType] = 1;
    } else {
      counters[mimeType]++;
    }
  }

  return article;
}

zim::Blob ArticleSource::getData(const std::string& aid) {
  std::cout << "Packing data for " << aid << std::endl;

  if (data != NULL) {
    delete(data);
    data = NULL;
  }

  if (aid.substr(0, 3) == "/M/") {
    std::string value; 

    if ( aid == "/M/Language") {
      value = language;
    } else if (aid == "/M/Creator") {
      value = creator;
    } else if (aid == "/M/Publisher") {
      value = publisher;
    } else if (aid == "/M/Title") {
      value = title;
    } else if (aid == "/M/Description") {
      value = description;
    } else if ( aid == "/M/Date") {
      time_t t = time(0);
      struct tm * now = localtime( & t );
      std::stringstream stream;
      stream << (now->tm_year + 1900) << '-' 
	     << std::setw(2) << std::setfill('0') << (now->tm_mon + 1) << '-'
	     << std::setw(2) << std::setfill('0') << now->tm_mday;
      value = stream.str();
    } else if ( aid == "/M/Counter") {
      std::stringstream stream;
      for (std::map<std::string, unsigned int>::iterator it = counters.begin(); it != counters.end(); ++it) {
	stream << it->first << "=" << it->second << ";";
      }
      value = stream.str();
    }

    dataSize = value.length();
    data = new char[dataSize];
    memcpy(data, value.c_str(), dataSize);
  } else {
    std::string aidPath = directoryPath + "/" + aid;
    
    if (getMimeTypeForFile(aid).find("text/html") == 0) {
      std::string html = getFileContent(aidPath);
      GumboOutput* output = gumbo_parse(html.c_str());
      GumboNode* root = output->root;
      
      /* Rewrite links (src|href|...) attributes */
      std::map<std::string, bool> links;
      getLinks(root, links);
      std::map<std::string, bool>::iterator it;
      std::string aidDirectory = removeLastPathElement(aid, false, false);
      for(it = links.begin(); it != links.end(); it++) {
	if (!it->first.empty() && it->first[0] != '#') {
	  replaceStringInPlace(html, it->first, computeNewUrl(computeAbsolutePath(aid, it->first)));
	}
      }
      gumbo_destroy_output(&kGumboDefaultOptions, output);
      
      dataSize = html.length();
      data = new char[dataSize];
      memcpy(data, html.c_str(), dataSize);
    } else if (getMimeTypeForFile(aid).find("text/css") == 0) {
      std::string css = getFileContent(aidPath);
      size_t startPos = 0;
      size_t endPos = 0;
      std::string url;

      while ((startPos = css.find("url(", endPos)) && startPos != std::string::npos) {
	endPos = css.find(")", startPos);
	startPos = startPos + (css[startPos+4] == '\'' || css[startPos+4] == '"' ? 5 : 4);
	endPos = endPos - (css[endPos-1] == '\'' || css[endPos-1] == '"' ? 1 : 0);
	url = css.substr(startPos, endPos - startPos);
	replaceStringInPlace(css, url, computeNewUrl(computeAbsolutePath(aid, url)));
      }

      dataSize = css.length();
      data = new char[dataSize];
      memcpy(data, css.c_str(), dataSize);
    } else {
      dataSize = getFileSize(aidPath);
      data = new char[dataSize];
      memcpy(data, getFileContent(aidPath).c_str(), dataSize);
    }
  }

  return zim::Blob(data, dataSize);
}

/* Non ZIM related code */
void usage() {
  std::cout << "zimwriterfs --welcome=html/index.html --favicon=media/favicon.png --language=fra --title=foobar --description=mydescription --creator=Wikipedia --publisher=Kiwix [--minChunkSize=1024] DIRECTORY ZIM" << std::endl;
  std::cout << "\tDIRECTORY is the path of the directory containing the HTML pages you want to put in the ZIM file," << std::endl;
  std::cout << "\tZIM       is the path of the ZIM file you want to obtain." << std::endl;
}

void *visitDirectory(const std::string &path) {
  std::cout << "Visiting directory " << path << std::endl;
  pthread_setcanceltype(PTHREAD_CANCEL_DEFERRED, NULL);
  DIR *directory;

  /* Open directory */
  directory = opendir(path.c_str());
  if (directory == NULL) {
    std::cerr << "Unable to open directory " << path << std::endl;
    exit(1);
  }

  /* Read directory content */
  struct dirent *entry;
  while (entry = readdir(directory)) {
    std::string entryName = entry->d_name;
    std::string fullEntryName = path + '/' + entryName;

    switch (entry->d_type) {
    case DT_REG:
      pushToFilenameQueue(fullEntryName);
      break;
    case DT_DIR:
      if (entryName != "." && entryName != "..") {
	visitDirectory(fullEntryName);
      }
      break;
    }
  }

  closedir(directory);
}

void *visitDirectoryPath(void *path) {
  visitDirectory(directoryPath);
  std::cout << "Quitting visitor" << std::endl;
  directoryVisitorRunning(false); 
  pthread_exit(NULL);
}

int main(int argc, char** argv) {
  ArticleSource source;
  int minChunkSize = 2048;

  /* Init */
  magic = magic_open(MAGIC_MIME);
  magic_load(magic, NULL);
  pthread_mutex_init(&filenameQueueMutex, NULL);
  pthread_mutex_init(&directoryVisitorRunningMutex, NULL);

  /* Init file extensions hash */
  extMimeTypes["HTML"] = "text/html";
  extMimeTypes["html"] = "text/html";
  extMimeTypes["HTM"] = "text/html";
  extMimeTypes["htm"] = "text/html";
  extMimeTypes["PNG"] = "image/png";
  extMimeTypes["png"] = "image/png";
  extMimeTypes["TIFF"] = "image/tiff";
  extMimeTypes["tiff"] = "image/tiff";
  extMimeTypes["TIF"] = "image/tiff";
  extMimeTypes["tif"] = "image/tiff";
  extMimeTypes["JPEG"] = "image/jpeg";
  extMimeTypes["jpeg"] = "image/jpeg";
  extMimeTypes["JPG"] = "image/jpeg";
  extMimeTypes["jpg"] = "image/jpeg";
  extMimeTypes["GIF"] = "image/gif";
  extMimeTypes["gif"] = "image/gif";
  extMimeTypes["SVG"] = "image/svg+xml";
  extMimeTypes["svg"] = "image/svg+xml";
  extMimeTypes["TXT"] = "text/plain";
  extMimeTypes["txt"] = "text/plain";
  extMimeTypes["XML"] = "text/xml";
  extMimeTypes["xml"] = "text/xml";
  extMimeTypes["PDF"] = "application/pdf";
  extMimeTypes["pdf"] = "application/pdf";
  extMimeTypes["OGG"] = "application/ogg";
  extMimeTypes["ogg"] = "application/ogg";
  extMimeTypes["JS"] = "application/javascript";
  extMimeTypes["js"] = "application/javascript";
  extMimeTypes["CSS"] = "text/css";
  extMimeTypes["css"] = "text/css";

  /* Argument parsing */
  static struct option long_options[] = {
    {"verbose", no_argument, 0, 'w'},
    {"welcome", required_argument, 0, 'w'},
    {"minchunksize", required_argument, 0, 'm'},
    {"favicon", required_argument, 0, 'f'},
    {"language", required_argument, 0, 'l'},
    {"title", required_argument, 0, 't'},
    {"description", required_argument, 0, 'd'},
    {"creator", required_argument, 0, 'c'},
    {"publisher", required_argument, 0, 'p'},
    {0, 0, 0, 0}
  };
  int option_index = 0;
  int c;

  do { 
    c = getopt_long(argc, argv, "vw:m:f:t:d:c:l:p:", long_options, &option_index);
    
    if (c != -1) {
      switch (c) {
      case 'v':
	verboseFlag = true;
	break;
      case 'c':
	creator = optarg;
	break;
      case 'd':
	description = optarg;
	break;
      case 'f':
	favicon = optarg;
	break;
      case 'l':
	language = optarg;
	break;
      case 'm':
	minChunkSize = atoi(optarg);
	break;
      case 'p':
	publisher = optarg;
	break;
      case 't':
	title = optarg;
	break;
      case 'w':
	welcome = optarg;
	break;
      }
    }
  } while (c != -1);

  while (optind < argc) {
    if (directoryPath.empty()) {
      directoryPath = argv[optind++];
    } else if (zimPath.empty()) {
      zimPath = argv[optind++];
    } else {
      std::cerr << "You have too much arguments!" << std::endl;
      usage();
      exit(1);
    }
  }
  
  if (directoryPath.empty() || zimPath.empty() || creator.empty() || publisher.empty() || description.empty() || language.empty() || welcome.empty() || favicon.empty()) {
    std::cerr << "You have too few arguments!" << std::endl;
    usage();
    exit(1);
  }

  /* Check arguments */
  if (directoryPath[directoryPath.length()-1] == '/') {
    directoryPath = directoryPath.substr(0, directoryPath.length()-1);
  }

  /* Prepare metadata */
  metadataQueue.push("Language");
  metadataQueue.push("Publisher");
  metadataQueue.push("Creator");
  metadataQueue.push("Title");
  metadataQueue.push("Description");
  metadataQueue.push("Date");
  metadataQueue.push("Favicon");
  metadataQueue.push("Counter");

  /* Check metadata */
  if (!fileExists(directoryPath + "/" + welcome)) {
    std::cerr << "Unable to find welcome page " << directoryPath << "/" << welcome << std::endl;
    exit(1);
  }

  if (!fileExists(directoryPath + "/" + favicon)) {
    std::cerr << "Unable to find favicon " << directoryPath << "/" << favicon << std::endl;
    exit(1);
  }

  /* Directory visitor */
  directoryVisitorRunning(true);
  pthread_create(&(directoryVisitor), NULL, visitDirectoryPath, (void*)NULL);
  pthread_detach(directoryVisitor);

  /* ZIM creation */
  try {
    zimCreator.create(zimPath, source);
    zimCreator.setMinChunkSize(minChunkSize);
  } catch (const std::exception& e) {
    std::cerr << e.what() << std::endl;
  }
}
