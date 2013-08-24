#include <iostream>
#include <sstream>
#include <vector>
#include <zim/writer/zimcreator.h>
#include <zim/blob.h>

#include <getopt.h>

class TestArticle : public zim::writer::Article
{
    std::string _id;
    std::string _data;

  public:
    TestArticle()  { }
    explicit TestArticle(const std::string& id);

    virtual std::string getAid() const;
    virtual char getNamespace() const;
    virtual std::string getUrl() const;
    virtual std::string getTitle() const;
    virtual bool isRedirect() const;
    virtual std::string getMimeType() const;
    virtual std::string getRedirectAid() const;

    zim::Blob data()
    { return zim::Blob(&_data[0], _data.size()); }
};

TestArticle::TestArticle(const std::string& id)
  : _id(id)
{
  std::ostringstream data;
  data << "this is article " << id << std::endl;
  _data = data.str();
}

std::string TestArticle::getAid() const
{
  return _id;
}

char TestArticle::getNamespace() const
{
  return 'A';
}

std::string TestArticle::getUrl() const
{
  return _id;
}

std::string TestArticle::getTitle() const
{
  return _id;
}

bool TestArticle::isRedirect() const
{
  return false;
}

std::string TestArticle::getMimeType() const
{
  return "text/plain";
}

std::string TestArticle::getRedirectAid() const
{
  return "";
}

class TestArticleSource : public zim::writer::ArticleSource
{
    std::vector<TestArticle> _articles;
    unsigned _next;

  public:
    explicit TestArticleSource(unsigned max = 16);

    virtual const zim::writer::Article* getNextArticle();
    virtual zim::Blob getData(const std::string& aid);
};

TestArticleSource::TestArticleSource(unsigned max)
  : _next(0)
{
  _articles.resize(max);
  for (unsigned n = 0; n < max; ++n)
  {
    std::ostringstream id;
    id << (n + 1);
    _articles[n] = TestArticle(id.str());
  }
}

const zim::writer::Article* TestArticleSource::getNextArticle()
{
  if (_next >= _articles.size())
    return 0;

  unsigned n = _next++;

  return &_articles[n];
}

zim::Blob TestArticleSource::getData(const std::string& aid)
{
  unsigned n;
  std::istringstream s(aid);
  s >> n;
  return _articles[n-1].data();
}

void usage() {
  std::cout << "zimwriterfs DIRECTORY ZIM" << std::endl;
  std::cout << "\tDIRECTORY is the path of the directory containing the HTML pages you want to put in the ZIM file," << std::endl;
  std::cout << "\tZIM       is the path of the ZIM file you want to obtain." << std::endl;
}


int main(int argc, char** argv) {
  bool verboseFlag = false;
  std::string directoryPath;
  std::string zimPath;

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

  /*
  try
  {
    zim::writer::ZimCreator c(argc, argv);
    TestArticleSource src;
    c.create("foo.zim", src);
  }
  catch (const std::exception& e)
  {
    std::cerr << e.what() << std::endl;
  }
  */
}

