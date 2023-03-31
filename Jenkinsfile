def triggers = []
def JENKINS_BUILD_CAUSE = currentBuild.getBuildCauses().shortDescription
def isNightlyBuild = "${JENKINS_BUILD_CAUSE}".contains('timer')
def isManualBuild = "${JENKINS_BUILD_CAUSE}".contains('Started by user')


properties(
    [
        pipelineTriggers(triggers),
        buildDiscarder(logRotator(daysToKeepStr: '7', artifactDaysToKeepStr: '7')),
        disableConcurrentBuilds()
    ]
)

node ('RHEL8')
{
  env.NODEJS_HOME = "${tool 'nodejs-16.14.0'}"
  env.PATH="${env.NODEJS_HOME};${env.PATH}"

  try {
    def version = "1.0.0.${env.BUILD_ID}"
    def product = 'AppSrvGW'

    stage('Started') {
      echo "${JENKINS_BUILD_CAUSE}"

    }

    stage('Checkout') {
      deleteDir()
      bat "git clone https://github.com/Intrado/cobra-telephony.git ."
    }

    if (isManualBuild) {
      stage('Version') {
        bat "git clone https://github.com/Intrado/gitscripts.git .gitscripts"
        version = readFile "version.txt"
        echo "Version before set: ${version}"
        bat "ruby .gitscripts/IncreaseVersion.rb version.txt"
        version = readFile "version.txt"
        echo "New Version: ${version}"
    
        def versionFiles = [  ]
        for ( file in versionFiles ) {
            bat "ruby .gitscripts/SetVersion.rb ${file} ${version}"
        }
      }
    }

    stage('Build') {
      bat "node --version"
      bat "ruby import.rb"
      bat "ruby build.rb"
    }

    if (isManualBuild) {
      stage('Commit') {
        commit(product, version)
        addTag(product, version)
        notifyVersion(product, version)
      }
    }
	
    if (isManualBuild) {
      stage('Upload Binairies') {
        // Pack and Push to artifactory
        def server = Artifactory.server ('artifacts')
        bat "dir"
        env.PATH="C:/Program Files/Git/usr/bin;${env.PATH}"
        bat "tar -czvf ${product}.${version}.tar.gz server/prod/*"
        bat "dir"
        def winSrvUploadSpec = "{ \"files\": [ { \"pattern\": \"${product}.${version}.tar.gz\", \"target\" : \"Safety-Systems-generic-prod/\" } ] }"
        def wsbuildInfo = server.upload(winSrvUploadSpec)
        server.publishBuildInfo(wsbuildInfo)  
      }
    }	
  }
  catch (e)
  {
      currentBuild.result = 'FAILED'
      notifyBuild(currentBuild.result)
      throw e
  }
}

def notifyBuild(String buildStatus = 'STARTED')
{
  // buildStatus of null means successful
  buildStatus = buildStatus ?: 'SUCCESSFUL'

  def subject = "${buildStatus}: Job '${env.JOB_NAME} [${env.BUILD_NUMBER}]'"
  def summary = "${subject} (${env.BUILD_URL})"
  def details = """${buildStatus}: Job '${env.JOB_NAME} [${env.BUILD_NUMBER}]': Check console output at ${env.BUILD_URL}"""
 // def recipients = ["sdeziel@intrado.com,gchen@intrado.com"]

  for ( recipient in recipients ) {
    emailext (
      attachLog: true,
      subject: subject,
      body: details,
      mimeType: 'text/html',
      to: recipient
    )
  }
}

def notifyVersion(product, version)
{
  def subject = "Project ${product} ${version} is ready"
  def details = "${version} - Released"
  //def recipients = ["fslight@intrado.com,sdeziel@intrado.com,gchen@intrado.com,dparisien@intrado.com,mtourangeau@intrado.com"]

  for ( recipient in recipients ) {
    emailext (
      attachLog: true,
      subject: subject,
      body: details,
      mimeType: 'text/html',
      to: recipient
    )
  }
}

def commit(product, version)
{
    bat "git add ." 
    bat "git commit -m \"Project ${product} ${version} is ready\"" 
    bat "git pull" 
    bat 'git push'
}

def addTag(product, version)
{ 
    def text = "Automatic build ${product} ${version}"
    // get branch 
    bat 'git rev-parse --abbrev-ref HEAD > t.txt'
    def branch = readFile "t.txt"
    branch = branch.trim()
    println "branch: " + branch

    // get repo name
    bat "git config --get remote.origin.url > t.txt"
    def repo = readFile "t.txt"
    repo = repo - ".git"
    if (repo.contains("https://"))
    {
      repo = repo - "https://"
      repo = repo.split("/")[2].trim()
    }
    else
    {
      repo = repo - "git@"
      repo = repo.split("/")[1].trim()
    }
    println "repo: " + repo
    def repo_full_name = "https://api.github.com/repos/Intrado/" + repo
    repo_full_name = repo_full_name.trim()
    repo_rel = repo_full_name + "/releases"
    println "repo_rel=" + repo_rel

    // get token, must have been saved in github.token git configuration variable
    def command = 'git config --global github.token > t.txt'
    println "command=" + command
    bat command
    def token = readFile "t.txt"
    token = token.trim()
    if(token == "")
    {
      println "Github token not found."
      println "Try this command:"
      println "git config --global github.token yourpersonaltoken"
      throw new Exception("Github token not found.")
    }
    println "token=" + token

    // check if repo exists and that we have access to it
    env.PATH="C:/Program Files/Git/mingw64/bin;${env.PATH}"
    command = "curl.exe -i -u :\"${token}\" \"${repo_full_name}\""
    println "command=" + command
    bat command
    def json_string = readFile "t.txt"
    println "json_string=" + json_string

    // prepare data to be passed in release creation command
    def json_data = "{\\\"tag_name\\\": \\\"${version}\\\", \\\"target_commitish\\\": \\\"${branch}\\\", \\\"name\\\": \\\"${version}\\\", \\\"body\\\": \\\"${text}\\\", \\\"draft\\\": false, \\\"prerelease\\\": false}"
    println json_data
    
    // Create release on github
    println "Create release ${version} for repo: ${repo_full_name} branch: ${branch}"
    println "Using URL ${repo_rel}?access_token=${token}"
    println "Data:" + json_data
    command = "curl.exe -u :\"${token}\" \"${repo_rel}\" --data \"${json_data}\""
    println "command="+command
    bat command
}