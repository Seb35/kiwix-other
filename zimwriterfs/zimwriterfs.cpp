#include <sys/types.h>
#include <sys/stat.h>
#include <assert.h>
#include <getopt.h>
#include <ctime>
#include <stdio.h>
#include <dirent.h>
#include <unistd.h>
#include <pthread.h>

#include <fstream>
#include <iostream>
#include <sstream>
#include <vector>
#include <queue>
#include <cstdio>
#include <cerrno>

#include <magic.h>

#include <zim/writer/zimcreator.h>
#include <zim/blob.h>

#include <gumbo.h>

#define MAX_QUEUE_SIZE 100

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

std::string getFileContent(const std::string &path) {
  std::FILE *fp = std::fopen(path.c_str(), "rb");
  if (fp) {
    std::string contents;
    std::fseek(fp, 0, SEEK_END);
    contents.resize(std::ftell(fp));
    std::rewind(fp);
    std::fread(&contents[0], 1, contents.size(), fp);
    std::fclose(fp);
    return(contents);
  }
  throw(errno);
}

unsigned int getFileSize(const std::string &path) {
  struct stat filestatus;
  stat(path.c_str(), &filestatus);
  return filestatus.st_size;
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
    std::string aid;
    std::string url;
    std::string title;
    std::string mimeType;
    std::string redirectAid;
    std::string data;

  public:
    Article() { }
    explicit Article(const std::string& id);
  
    virtual std::string getAid() const;
    virtual char getNamespace() const;
    virtual std::string getUrl() const;
    virtual std::string getTitle() const;
    virtual bool isRedirect() const;
    virtual std::string getMimeType() const;
    virtual std::string getRedirectAid() const;
    virtual std::string getData() const;
    virtual void setData(std::string &value);
    virtual bool shouldCompress() const;
};

class MetadataArticle : public Article {
  public:
  MetadataArticle(std::string &id) {
    aid = "/M/" + id;
    url = id;
    mimeType="text/plain";
    ns = 'M';
  }
};

Article::Article(const std::string& path)
  : aid(path) {
  std::string html;

  /* mime-type */
  mimeType = std::string(magic_file(magic, path.c_str()));
  std::size_t found = mimeType.find(";");
  if (found != std::string::npos) {
    /* Don't remove the semi-colon, otherwise ZIM file is corrupt,
       strange */
    mimeType = mimeType.substr(0, found+1);
  }

  /* namespace */
  if (mimeType.find("text") == 0) {
    if (mimeType.find("text/html") == 0) {
      ns = 'A';
    } else {
      ns = '-';
    }
  } else {
    ns = 'I';
  }
  
  /* Search the content of the <title> tag in the HTML */
  if (mimeType == "text/html") {
    html = getFileContent(path);
    GumboOutput* output = gumbo_parse(html.c_str());
    GumboNode* root = output->root;

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

    gumbo_destroy_output(&kGumboDefaultOptions, output);

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
      std::replace( title.begin(), title.end(), '_',  ' ');
    }
  }

  /* url */
  url = path;
}

std::string Article::getData() const
{
  return data;
}

void Article::setData(std::string &value)
{
  data = value;
}

std::string Article::getAid() const
{
  return aid;
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
  std::string mimeType = getMimeType();
  return (mimeType.find("text") == 0 ? true : false);
}

/* ArticleSource class */
class ArticleSource : public zim::writer::ArticleSource {
  public:
    explicit ArticleSource();
    virtual const zim::writer::Article* getNextArticle();
    virtual zim::Blob getData(const std::string& aid);
};

ArticleSource::ArticleSource() {
}

const zim::writer::Article* ArticleSource::getNextArticle() {
  std::cout << "getNexArticle..." << std::endl;
  std::string aid;
  Article *article = NULL;
  
  if (!metadataQueue.empty()) {
    aid = metadataQueue.front();
    metadataQueue.pop();
    article = new MetadataArticle(aid);
  } else if (popFromFilenameQueue(aid)) {
    std::cout << "Packing " << aid << "..." << std::endl;
    article = new Article(aid);
  }

  return article;
}

zim::Blob ArticleSource::getData(const std::string& aid) {
  if (aid.substr(0, 3) == "/M/") {
    std::string value; 
    if ( aid == "/M/Language") {
      value = language;
    } else if ( aid == "/M/Creator") {
      value = creator;
    } else if ( aid == "/M/Publisher") {
      value = publisher;
    } else if ( aid == "/M/Title") {
      value = title;
    } else if ( aid == "/M/Description") {
      value = description;
    } else if ( aid == "/M/Date") {
      time_t t = time(0);
      struct tm * now = localtime( & t );
      std::stringstream stream;
      stream << (now->tm_year + 1900) << '-' 
	     << (now->tm_mon + 1) << '-'
	     << now->tm_mday
	     << std::endl;
      value = stream.str();
    }
    return zim::Blob(value.c_str(), value.size());
  } else {
    std::string data = getFileContent(aid);
    unsigned int size = getFileSize(aid);
    return zim::Blob(data.c_str(), size);
  }
}

/* Non ZIM related code */
void usage() {
  std::cout << "zimwriterfs --welcome=html/index.html --favicon=images/favicon.png --language=fra --title=foobar --description=mydescription --creator=Wikipedia --publisher=Kiwix DIRECTORY ZIM" << std::endl;
  std::cout << "\tDIRECTORY is the path of the directory containing the HTML pages you want to put in the ZIM file," << std::endl;
  std::cout << "\tZIM       is the path of the ZIM file you want to obtain." << std::endl;
}

void *visitDirectory(const std::string &path) {
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
      std::cout << "Pushing '" << fullEntryName << "'" <<std::endl;
      pushToFilenameQueue(fullEntryName);
      break;
    case DT_DIR:
      if (entryName != "." && entryName != "..") {
	std::cout << "Visiting '" << fullEntryName << "'" <<std::endl;
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

  /* Init */
  magic = magic_open(MAGIC_MIME);
  magic_load(magic, NULL);

  pthread_mutex_init(&filenameQueueMutex, NULL);
  pthread_mutex_init(&directoryVisitorRunningMutex, NULL);

  /* Argument parsing */
  static struct option long_options[] = {
    {"verbose", no_argument, 0, 'w'},
    {"welcome", required_argument, 0, 'w'},
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
    c = getopt_long(argc, argv, "vw:f:t:d:c:l:p:", long_options, &option_index);
    
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
    directoryPath = directoryPath.substr(directoryPath.length()-2);
  }

  /* Directory visitor */
  directoryVisitorRunning(true);
  pthread_create(&(directoryVisitor), NULL, visitDirectoryPath, (void*)NULL);
  pthread_detach(directoryVisitor);

  /* Prepare metadata */
  metadataQueue.push("Language");
  metadataQueue.push("Publisher");
  metadataQueue.push("Creator");
  metadataQueue.push("Title");
  metadataQueue.push("Description");
  metadataQueue.push("Date");
  metadataQueue.push("Welcome");
  metadataQueue.push("Favicon");

  /* ZIM creation */
  try {
    zimCreator.create(zimPath, source);
  } catch (const std::exception& e) {
    std::cerr << e.what() << std::endl;
  }
}
