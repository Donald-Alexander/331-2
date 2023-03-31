#!/usr/bin/env ruby
require 'fileutils'
startTime = Time.now;

if ARGV.include? "-c"
  system("npm i -g rimraf")

  Dir.chdir './telephony'
  system('rimraf.cmd node_modules')
  Dir.chdir '../'

  Dir.chdir './teletest'
  system('rimraf.cmd node_modules')
  Dir.chdir '../'
end

if ARGV.include? "-u"
  system("npm i -g rimraf")

  Dir.chdir './telephony'
  system('rimraf.cmd node_modules')
  system('del package-lock.json')
  raise if not system('npm.cmd i')
  Dir.chdir '../'

  Dir.chdir './teletest'
  system('rimraf.cmd node_modules')
  system('del package-lock.json')
  raise if not system('npm.cmd i')
  Dir.chdir '../'
end

if ARGV.empty? or ARGV.include? "-i"
  puts "*************************************** npm i telephony *************************************"
  Dir.chdir './telephony'
  raise if not system('npm.cmd i')
  Dir.chdir '../'

  puts "*************************************** npm i teletest *************************************"
  Dir.chdir './teletest'
  raise if not system('npm.cmd i')
  Dir.chdir '../'
end

if ARGV.empty? or ARGV.include? "teletest"
  FileUtils.rm_rf('./dist')
  FileUtils.rm_rf('./bin')

  puts "*************************************** Compiling teletest ***************************************"
  Dir.chdir('./teletest')
  raise if not system('npm.cmd run build')
  Dir.chdir '../'

  FileUtils.mkdir_p './bin'
  FileUtils.cp_r('./teletest/build/.', './bin')
  
end

puts "Completed - total: %d seconds" % [Time.now - startTime]
