<?php

// see https://bugzilla.wikimedia.org/show_bug.cgi?id=8147

class MungeTitle
{
	function __construct($type = FALSE)
	{
		if (!$type)
			$type = 'default';

		$fun = array('MungeTitle', 'munge' . ucfirst($type));
		if (is_callable($fun)) {
			$this->method = $fun;
		}
		else
		{
			throw new Exception("no such titlemunger exists: {$type}");
		}
	}

	function munge($path)
	{
		return call_user_func($this->method, $path);
	}

	function getMethod()
	{
		return get_class($this) . "::" . $this->method[1];
	}

	static function mungeDefault($path)
	{
		$path = self::truncate_unique($path);
		$path = self::getHashedDirectory($path, 3)."/".$path;
		return $path;
	}

	static function mungeMd5($path)
	{

		$path = urldecode($path);
		$match = array();
		preg_match("!(?:[^./]+)(?<ext>[.][^./]+)$!", $path, $match);
		$path = md5($path) . $match['ext'];
		$path = self::getHashedDirectory($path, 3)."/".substr($path, 3);

		return $path;
	}

	static function mungeWindows( $name ) {

		global $wgLang;
		# Replace illegal characters for Windows paths with underscores
		$friendlyName = strtr( $name, '/\\*?"<>|~', '_________' );

		# Work out lower case form. We assume we're on a system with case-insensitive
		# filenames, so unless the case is of a special form, we have to disambiguate
		if ( function_exists( 'mb_strtolower' ) ) {
			$lowerCase = $wgLang->ucfirst( mb_strtolower( $name ) );
		} else {
			$lowerCase = ucfirst( strtolower( $name ) );
		}

		# Handle colon specially by replacing it with tilde
		# Thus we reduce the number of paths with hashes appended
		$friendlyName = str_replace( ':', '~', $friendlyName );
		$friendlyName = self::truncate_unique($friendlyName);
		$friendlyName = self::getHashedDirectory($friendlyName, 3)."/".$friendlyName;

		return $friendlyName;
	}

	static function truncate_unique($filename)
	{
		$max_length = 255 - 5; // .html
		if (strlen($filename) > $max_length)
		{
			# Make it mostly unique
			$filename = substr($filename, 0, $max_length) . '_' . substr(md5( $filename ), 0, 4);
		}
		return $filename;
	}

	static function getHashedDirectory( &$filename, $depth )
	{
		# Find the first colon if there is one, use characters after it
		$p = strpos( $filename, ':' );
		if ( $p !== false ) {
			$dbk = substr( $filename, $p + 1 );
			$dbk = substr( $dbk, strspn( $dbk, '_' ) );
		} else {
			$dbk = $filename;
		}

		# Split into characters
		$m = array();
		preg_match_all( '/./us', $dbk, $m );

		$chars = $m[0];
		$length = count( $chars );
		$dir = '';

		for ( $i = 0; $i < $depth; $i++ ) {
			if ( $i ) {
				$dir .= '/';
			}
			if ( $i >= $length ) {
				$dir .= '_';
			} else {
				$c = $chars[$i];
				if ( ord( $c ) >= 128 || preg_match( '/[a-zA-Z0-9!#$%&()+,[\]^_`{}-]/', $c ) ) {
					if ( function_exists( 'mb_strtolower' ) ) {
						$dir .= mb_strtolower( $c );
					} else {
						$dir .= strtolower( $c );
					}
				} else {
					$dir .= sprintf( "%02X", ord( $c ) );
				}
			}
		}
		return $dir;
	}
}
