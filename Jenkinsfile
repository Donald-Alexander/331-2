node
{
  try {
    stage('Started') {
      echo "HELLO"
      bat "ruby -v"
    }

    stage('Checkout') {
      echo "Checkout"
      bat "ruby -v"
    }

    if (isManualBuild) {
      stage('Version') {
        bat "ruby .gitscripts/IncreaseVersion.rb Version.txt"
    }

    stage('Build') {
      bat "node --version"
      bat "ruby import.rb"
      bat "ruby build.rb"
    } 	
  }
  catch (e)
  {
      currentBuild.result = 'FAILED'
      notifyBuild(currentBuild.result)
      throw e
  }
}
