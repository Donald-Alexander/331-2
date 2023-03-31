#!/usr/bin/env ruby

require "../gitscripts/ImportProjects.rb"
require 'fileutils'

if !ARGV.include? "sip.js"
	# Ensure gitscripts are up to date
	if not FileTest.directory?("../gitscripts")
		raise if not system('git clone git@github.com:Intrado/gitscripts.git ../gitscripts')
	end
	raise if not system('git -C ../gitscripts pull')
	raise if not system('git -C ../gitscripts reset --hard HEAD')

	# Dependencies obtained from GitHub
	FileUtils.rm_rf('import')
	FileUtils.rm_rf('p911saas.common')

	P911SaaSCommonVersion = '1.0.0.136'

	importProjects("CallTaking.Power911.SaaS.Common", P911SaaSCommonVersion, "src.tar.gz", 'p911saas.common')

	# Compiling ... CallTaking.Power911.SaaS.Common 
	Dir.chdir('p911saas.common')
	raise if not system('ruby build.rb')
	Dir.chdir('..')
end

FileUtils.rm_rf('sip.js')
# IMPORTANT: Please do not change the following syntax 'TelephonySipJsVersion = '.  It is used by P911 to get the sip.js GIT version.
TelephonySipJsVersion = '0.15.6.3'
importProjects("sip.js", TelephonySipJsVersion, "src.tar.gz", 'telephony/sip.js')

# sip.js
# No need to Compile our github sip.js repo.
# The version we get has already been built.

