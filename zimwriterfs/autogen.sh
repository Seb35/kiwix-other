#! /bin/sh

# Generate the aclocal.m4 file for automake, based on configure.in
aclocal

# Regenerate the files autoconf / automake
libtoolize --force --automake

# Remove old cache files
rm -f config.cache
rm -f config.log

# Generate the configure script based on configure.in
autoconf

# Generate the Makefile.in
automake -a --foreign
