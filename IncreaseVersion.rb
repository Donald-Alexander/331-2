# This scripts increments the build number in a text file
# The text file is expected to contain a build number in
# the following format: A.B.C.D on the first line.
def increaseVersion(file)
    f = File.new(file)
    oldreleasetag = f.readline
    f.close
    releasearray = oldreleasetag.split(".")
    lastdigit = releasearray.pop
    releasearray.push( (lastdigit.to_i+1).to_s )
    releasetag = releasearray.join(".")
    f = File.new(file, "w+")
    f.write(releasetag)
    f.close
    puts "Increment build number to " + releasetag + " for file " + file
    return releasetag
  end
  
  if not ARGV.empty? and File.file?(ARGV[0])
    increaseVersion(ARGV[0])
  end