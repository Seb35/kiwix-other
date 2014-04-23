#!/usr/bin/env python

"""
Class for scraping www.TED.com.
"""
__title__ = 'webscraper'
__author__ = 'Rashiq Ahmad'
__license__ = 'GPLv3'

import os
from os import path
import sys
import shutil
import distutils.dir_util
from datetime import datetime
from sys import platform as _platform
import requests
from bs4 import BeautifulSoup
from urlparse import urljoin
import utils
import json
from jinja2 import Environment, FileSystemLoader
import urllib
from WebVTTcreator import WebVTTcreator
from collections import defaultdict


class Scraper():

    # The base Url. The link gives you a grid of all TED talks.
    BASE_URL = 'http://new.ted.com/talks/browse'
    # BeautifulSoup instance
    soup = None
    # Page count
    pages = None
    # List of links to all TED talks
    videos = []
    # Categories of the TED talks
    categories = ['technology', 'entertainment',
                  'design', 'business', 'science', 'global issues']

    def __init__(self):
        """
        Extract number of video pages. Generate the specific
        video page from it and srape it.
        """
        self.build_dir = path.join(os.getcwd(), '..', 'build')
        self.scraper_dir = path.join(self.build_dir, 'TED', 'scraper')
        self.html_dir = path.join(self.build_dir, 'TED', 'html')
        self.meta_data_dir = path.join(self.scraper_dir, 'TED.json')
        self.templates_dir = path.join(os.getcwd(), '..', 'scraper', 'templates')

    def extract_page_number(self):
        """
        Extract the number of video pages by looking at the
        pagination div at the bottom. Select all <a>-tags in it and
        return the last element in the list. That's our total count
        """
        self.soup = BeautifulSoup(requests.get(self.BASE_URL).text)
        pages = self.soup.select('div.pagination a.pagination__item')[-1]
        return int(pages.text)

    def extract_all_video_links(self):
        """
        This method will build the specifiv video site by appending
        the page number to the 'page' parameter to the url.
        We will iterate through every page and extract every
        video link. The video link is extracted in `extract_videos()`.
        """
        for page in range(1, self.extract_page_number()):
            url = utils.build_video_page(page)
            html = requests.get(url).text
            self.soup = BeautifulSoup(html)
            self.extract_videos()
            print 'Finished scraping page {}'.format(page)
            break

    def extract_videos(self):
        """
        All videos are embedded in a <div> with the class name 'row'.
        We are searching for the div inside this div, that has an <a>-tag
        with the class name 'media__image', because this is the relative
        link to the representative TED talk. We have to turn this relative
        link to an absolute link. This is done through the `utils` class.
        """
        for video in self.soup.select('div.row div.media__image a'):
            url = utils.create_absolute_link(self.BASE_URL, video['href'])
            self.extract_video_info(url)
            break

    def extract_video_info(self, url):
        """
        Extract the meta-data of the video:
        Speaker, the profession of the speaker, a short biography of
        the speaker, the link to a picture of the speaker, title,
        publishing date, view count, description of the TED talk,
        direct download link to the video, download link to the subtitle
        files and a link to a thumbnail of the video.
        """
        self.soup = BeautifulSoup(requests.get(url).text)

        # Every TED video page has a <script>-tag with a Javascript
        # object with JSON in it. We will just stip away the object
        # signature and load the json to extract meta-data out of it.
        json_data = self.soup.select('div.talks-main script')
        if len(json_data) == 0: return
        json_data = json_data[-1].text
        json_data = ' '.join(json_data.split(',', 1)[1].split(')')[:-1])
        json_data = json.loads(json_data)

        # Extract the speaker of the TED talk
        speaker = json_data['talks'][0]['speaker']

        # Extract the profession of the speaker of the TED talk
        speaker_profession = \
            self.soup.select('div.talk-speaker__description')[0].text.strip()

        # Extract the short biography of the speaker of the TED talk
        speaker_bio = self.soup.select('div.talk-speaker__bio')[0].text.strip()

        # Extract the Url to the picture of the speaker of the TED talk
        speaker_picture = self.soup.select('img.thumb__image')[0]['src']

        # Extract the title of the TED talk
        title = json_data['talks'][0]['title']

        # Extract the description of the TED talk
        description = self.soup.select('p.talk-description')[0].text.strip()

        # Extract the upload date of the TED talk
        date = self.soup.find('div', class_="talk-hero__meta")
        date = date.find_all('span')[1]
        date.strong.replace_with('')
        date = date.text.strip()

        # Extract the length of the TED talk in minutes
        length = int(json_data['talks'][0]['duration'])
        length = divmod(length, 60)[0]

        # Extract the thumbnail of the of the TED talk video
        thumbnail = json_data['talks'][0]['thumb']

        # Extract the download link of the TED talk video
        if not json_data['talks'][0]['nativeDownloads']:
            return
        video_link = json_data['talks'][0]['nativeDownloads']['medium']
        if not video_link:
            return

        # Extract the video Id of the TED talk video.
        # We need this to generate the subtitle page.
        video_id = json_data['talks'][0]['id']

        # Generate a list of all subtitle languages with the link to
        # its subtitles page. It will be in this format:
        # [
        #     {
        #         'languageCode': u'en',
        #         'link': 'http://www.ted.com/talks/subtitles/id/1907/lang/en',
        #         'languageName': u'English'
        #     }
        # ]
        subtitles = [{'languageName': lang['languageName'],
                      'languageCode':lang['languageCode']}
                     for lang in json_data['talks'][0]['languages']]
        subtitles = utils.build_subtitle_pages(video_id, subtitles)

        # Extract the keywords for the TED talk
        keywords = self.soup.find(
            'meta', attrs={
                'name': 'keywords'})['content']
        keywords = [key.strip() for key in keywords.split(',')]

        # Extract the ratings list for the TED talk
        ratings = json_data['ratings']

        # Append the meta-data to a list
        self.videos.append([{
            'id': video_id,
            'title': title.encode('ascii', 'ignore'),
            'description': description.encode('ascii', 'ignore'),
            'speaker': speaker.encode('ascii', 'ignore'),
            'speaker_profession': speaker_profession.encode('ascii', 'ignore'),
            'speaker_bio': speaker_bio.encode('ascii', 'ignore'),
            'speaker_picture': speaker_picture.encode('ascii', 'ignore'),
            'date': date.encode('ascii', 'ignore'),
            'thumbnail': thumbnail.encode('ascii', 'ignore'),
            'video_link': video_link.encode('ascii', 'ignore'),
            'length': length,
            'subtitles': subtitles,
            'keywords': keywords,
            'ratings': ratings}])

    def dump_data(self):
        """
        Dump all the data about every TED talk in a json file
        inside the 'build' folder.
        """
        # Prettified json dump
        data = json.dumps(self.videos, indent=4, separators=(',', ': '))

        # Check, if the folder exists. Create it, if it doesn't.
        if not path.exists(self.scraper_dir):
            os.makedirs(self.scraper_dir)

        # Create or override the 'TED.json' file in the build
        # directory with the video data gathered from the scraper.
        with open(self.scraper_dir + '/TED.json', 'w') as ted_file:
            ted_file.write(data)

    def render_video_pages(self):
        """
        Render static html pages from the scraped video data and
        save the pages in TED/build/{video id}/index.html.
        """
        print 'Rendering template...'

        if not path.exists(self.meta_data_dir):
            sys.exit(
                "TED.json file not found. Run the script with the '-m' flag")

        self.load_metadata()

        env = Environment(loader=FileSystemLoader('templates'))
        template = env.get_template('video.html')

        for video in self.videos:
            for i in self.categories:
                if i in video[0]['keywords']:
                    video_id = str(video[0]['id'])
                    video_path = path.join(self.html_dir, i, video_id)
                    if not path.exists(video_path):
                        os.makedirs(video_path)

                    html = template.render(
                        title=video[0]['title'],
                        speaker=video[0]['speaker'],
                        description=video[0]['description'],
                        languages=video[0]['subtitles'],
                        speaker_bio=video[0]['speaker_bio'].replace('Full bio', ''),
                        date=video[0]['date'],
                        profession=video[0]['speaker_profession'])

                    html = html.encode('utf-8')
                    index_path = path.join(video_path, 'index.html')
                    with open(index_path, 'w') as html_page:
                        html_page.write(html)

    def render_welcome_page(self):
        """
        Create the data for the index.html page (the summary page).
        """
        if not path.exists(self.meta_data_dir):
            sys.exit(
                "TED.json file not found. Run the script with the '-m' flag")

        self.load_metadata()

        env = Environment(loader=FileSystemLoader('templates'))
        template = env.get_template('welcome.html')

        for i in self.categories:
            video_path = path.join(self.html_dir, i)
            if not path.exists(video_path):
                os.makedirs(video_path)
            
            index_path = path.join(video_path, 'index.html')
            with open(index_path, 'w') as html_page:
                html_page.write(self.create_welcome_page_data(i, template))

    def create_welcome_page_data(self, keyword, template):
        """
        Create the data for the index.html page (the summary page).
        """
        languages = []

        for video in self.videos:
            if not keyword in video[0]['keywords']: continue

            for language in video[0]['subtitles']:
                languages.append({'languageCode': language['languageCode'],
                                  'languageName': language['languageName']})

        languages = [dict(tpl) for tpl in set(tuple(item.items()) for item in languages)]
        languages = sorted(languages, key=lambda x: x['languageName'])

        html = template.render(languages=languages)
        html = html.encode('utf-8')
        return html

    def copy_files_to_rendering_directory(self):
        """
        Copy files from the /scraper directory to the /html/{zimfile} directory.
        """

        for i in self.categories:
            copy_dir = path.join(self.html_dir, i)
            css_dir = path.join(self.templates_dir, 'CSS')
            js_dir = path.join(self.templates_dir, 'JS')
            copy_css_dir = path.join(copy_dir, 'CSS')
            copy_js_dir = path.join(copy_dir, 'JS')

            if path.exists(css_dir):
                distutils.dir_util.copy_tree(css_dir, copy_css_dir)
            if path.exists(js_dir):
                distutils.dir_util.copy_tree(js_dir, copy_js_dir)

        for video in self.videos:
            for i in self.categories:
                if i in video[0]['keywords']:
                    video_id = str(video[0]['id'])
                    video_path = path.join(self.scraper_dir, video_id)
                    copy_video_path = path.join(self.html_dir, i, video_id)
                    copy_subs_path = path.join(copy_video_path, 'subs')
                    thumbnail = path.join(video_path, 'thumbnail.jpg')
                    subs = path.join(video_path, 'subs')
                    speaker = path.join(video_path, 'speaker.jpg')
                    video_ = path.join(video_path, 'video.mp4')

                    if path.exists(thumbnail):
                        shutil.copy(thumbnail, copy_video_path)

                    if path.exists(subs):
                        distutils.dir_util.copy_tree(subs, copy_subs_path)

                    if path.exists(speaker):
                        shutil.copy(speaker, copy_video_path)

    def generate_category_data(self):
        """
        Generate the json page data for every category.
        """

        self.load_metadata()
        video_list = defaultdict(list)

        for video in self.videos:
            for i in self.categories:
                if i in video[0]['keywords']:
                    json_data = \
                        {'languages': [lang['languageCode'] for lang in video[0]['subtitles']],
                         'id': video[0]['id'],
                         'description': video[0]['description'],
                         'title': video[0]['title'],
                         'speaker': video[0]['speaker']}
                    video_list[i].append(json_data)

        for k, v in video_list.items():
            js_path = path.join(self.html_dir, k, 'JS')
            data_path = path.join(js_path, 'data.js')

            if not path.exists(js_path):
                os.makedirs(js_path)

            with open(data_path, 'w') as page_file:
                json_data = json.dumps(v, indent=4, separators=(',', ': '))
                json_data = 'json_data = ' + json_data
                page_file.write(json_data)

    def resize_thumbnails(self):
        thumbnails = [path.join(root, name)
                      for root, dirs, files in os.walk(self.html_dir)
                      for name in files
                      if name == 'thumbnail.jpg']

        for thumbnail in thumbnails:
            resize_image(thumbnail)
            print 'Resizing ' + thumbnail

    def encode_videos(self):
        """
        Encode the videos from mp4 to webm. We will use ffmpeg over the 
        command line for this. There is a static binary version
        in the kiwix-other/TED/ directory, that we will use on macs. 
        """

        self.load_metadata()
        for video in self.videos:
            for i in self.categories:
                if i in video[0]['keywords']:
                    video_id =  str(video[0]['id'])
                    video_path = path.join(self.scraper_dir, video_id, 'video.mp4')
                    video_copy_path = path.join(self.html_dir, i, video_id, 'video.webm')

                    if path.exists(video_copy_path):
                        print 'Video already encoded. Skipping.'
                        continue

                    if path.exists(video_path):
                        self.convert_video_and_move_to_rendering(video_path, video_copy_path)
                        print 'Converting Video... ' + video[0]['title']

    def convert_video_and_move_to_rendering(self, from_path, to_path):
        ffmpeg = ''
        if _platform == "linux" or _platform == "linux2":
            ffmpeg = 'ffmpeg'
        elif _platform == "darwin":
            ffmpeg = path.join(os.getcwd(), '..', 'ffmpeg')

        command = ''.join(("""{} -i "{}" -codec:v libvpx -quality good -cpu-used 0 -b:v 600k""",
            """ -qmin 10 -qmax 42 -maxrate 500k -bufsize 1000k -threads 2 -vf scale=480:-1""",
            """ -codec:a libvorbis -b:a 128k -f webm "{}" """)).format(
            ffmpeg, from_path, to_path)

        os.system(command)

    def download_video_data(self):
        """
        Download all the TED talk videos and the meta-data for it.
        Save the videos in the TED/build/{video id}/video.mp4.
        Save the thumbnail for the video in
        TED/build/{video id}/thumbnail.jpg.
        Save the image of the speaker in TED/build/{video id}/speaker.jpg.
        """

        self.load_metadata()
        for video in self.videos:
            video_id = str(video[0]['id'])
            video_title = video[0]['title']
            video_link = video[0]['video_link']
            video_speaker = video[0]['speaker_picture']
            video_thumbnail = video[0]['thumbnail']
            video_dir = path.join(self.scraper_dir, video_id)
            video_file_path = path.join(video_dir, 'video.mp4')
            speaker_path = path.join(video_dir, 'speaker.jpg')
            thumbnail_path = path.join(video_dir, 'thumbnail.jpg')

            if not path.exists(video_dir):
                os.makedirs(video_dir)

            if not path.exists(video_file_path):
                print 'Downloading video... ' + video_title
                urllib.urlretrieve(video_link, video_file_path)
            else:
                print 'video.mp4 already exist. Skipping video ' + video_title

            # download an image of the speaker
            if not path.exists(speaker_path):
                print 'Downloading speaker image... ' + video_title
                urllib.urlretrieve(video_speaker, speaker_path)
            else:
                print 'speaker.jpg already exist. Skipping video ' + video_title

            # download the thumbnail of the video
            if not path.exists(thumbnail_path):
                print 'Downloading video thumbnail... ' + video_title
                urllib.urlretrieve(video_thumbnail, thumbnail_path)
            else:
                print 'thumbnail.jpg already exist. Skipping video ' + video_title

    def download_subtitles(self):
        """
        Download the subtitle files, generate a WebVTT file
        and save the subtitles in
        TED/build/{video id}/subs_{language code}.vtt.
        """
        self.load_metadata()
        for video in self.videos:
            video_id = str(video[0]['id'])
            video_title = video[0]['title']
            video_subtitles = video[0]['subtitles']
            subs_dir = path.join(self.scraper_dir, video_id, 'subs')

            if not path.exists(subs_dir):
                os.makedirs(subs_dir)
            else:
                print 'Subtitles already exist. Skipping video ' 
                continue

            # download subtitles
            print 'Downloading subtitles... ' + video_title
            for subtitle in video_subtitles:
                subtitle_file = WebVTTcreator(subtitle['link'], 11820).get_content()
                subtitle_file = subtitle_file.encode('utf-8')
                subtitle_file_name = 'subs_{}.vtt'.format(subtitle['languageCode'])
                subtitle_file_name = path.join (subs_dir, subtitle_file_name)
                with open(subtitle_file_name, 'w') as sub_file:
                    sub_file.write(subtitle_file)

    def load_metadata(self):
        """
        Load the dumped json meta-data file.
        """

        with open(self.meta_data_dir) as data_file:
            self.videos = json.load(data_file)


def resize_image(image_path):
    from PIL import Image
    image = Image.open(image_path)
    w, h = image.size
    image = image.resize((248, 187))
    image.save(image_path)


if __name__ == '__main__':
    pass
