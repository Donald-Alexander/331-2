node
{
 
    stage('Started') {
      echo "HELLO"
      bat "ruby -v"
    }

    stage('Checkout') {
      echo "Checkout"
      bat "ruby -v"
    }

   
    stage('Version') {
       bat "git clone https://github.com/Intrado/gitscripts.git .gitscripts"
       bat "ruby ./IncreaseVersion.rb Version.txt"
    }

    stage('Build') {
      bat "node --version"
      bat "ruby import.rb"
      bat "ruby build.rb"
    } 	
}

