#include <getopt.h>
#include <stdio.h>
#include <dirent.h>
#include <unistd.h>
#include <pthread.h>

#include <iostream>
#include <sstream>
#include <vector>
#include <queue>

#include <zim/writer/zimcreator.h>
#include <zim/blob.h>

#define MAX_QUEUE_SIZE 100

bool verboseFlag = false;
std::string directoryPath;
std::string zimPath;
zim::writer::ZimCreator zimCreator;
pthread_t directoryVisitor;
pthread_mutex_t filenameQueueMutex;
std::queue<std::string> filenameQueue;
pthread_mutex_t directoryVisitorRunningMutex;
bool isDirectoryVisitorRunningFlag = false;

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
  zim::writer::Article *article = NULL;

  if (isDirectoryVisitorRunning() || !isFilenameQueueEmpty()) {
    std::cout << "getNexArticle..." << std::endl;
  }

  return article;
}

zim::Blob ArticleSource::getData(const std::string& aid) {
  zim::Blob blob;
  return blob;
}

/* Non ZIM related code */
void usage() {
  std::cout << "zimwriterfs DIRECTORY ZIM" << std::endl;
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
    std::string fullEntryName = path + "/" + entryName;

    std::cout << fullEntryName << std::endl;

    switch (entry->d_type) {
    case DT_REG:
      pthread_mutex_lock(&filenameQueueMutex);
      filenameQueue.push(entryName);
      pthread_mutex_unlock(&filenameQueueMutex); 
      break;
    case DT_DIR:
      if (entryName != "." && entryName != "..") {
	std::cout << "visiting '" << fullEntryName << "'" <<std::endl;
	visitDirectory(fullEntryName);
      }
      break;
    }
  }

  closedir(directory);
  pthread_exit(NULL);
  directoryVisitorRunning(true);
}

void *visitDirectoryPath(void *path) {
  visitDirectory(directoryPath);
}

int main(int argc, char** argv) {
  ArticleSource source;

  /* Init */
  pthread_mutex_init(&filenameQueueMutex, NULL);
  pthread_mutex_init(&directoryVisitorRunningMutex, NULL);

  /* Argument parsing */
  static struct option long_options[] = {
    {"verbose", no_argument, 0, 'v'},
    {0, 0, 0, 0}
  };
  int option_index = 0;
  int c;

  do { 
    c = getopt_long(argc, argv, "v", long_options, &option_index);
    
    if (c != -1) {
      switch (c) {
      case 'v':
	verboseFlag = true;
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
  
  if (directoryPath.empty() || zimPath.empty()) {
    std::cerr << "You have too few arguments!" << std::endl;
    usage();
    exit(1);
  }

  /* Directory visitor */
  directoryVisitorRunning(true);
  pthread_create(&(directoryVisitor), NULL, visitDirectoryPath, (void*)NULL);
  pthread_detach(directoryVisitor);

  /* ZIM creation */
  try {
    zimCreator.create(zimPath, source);
  } catch (const std::exception& e)
    {
    std::cerr << e.what() << std::endl;
  }
}
