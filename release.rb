#!/usr/bin/env ruby
product = "CobraTelephony"
recipients = "fslight@intrado.com,sdeziel@intrado.com,eapril@intrado.com,mma2@intrado.com,etran@intrado.com,dtaha@intrado.com,slegris@intrado.com,bpeters2@intrado.com,gchen@intrado.com,pdiop@intrado.com,mlizotte@intrado.com" # comma-separated, no white spaces

versionFiles = [ # comma-separated files with relative path
]

productFiles = [ # comma-separated files with relative path
]

# Ensure gitscripts are up to date
if not FileTest.directory?("../gitscripts")
  raise if not system('git clone git@github.com:Intrado/gitscripts.git ../gitscripts')
end
raise if not system('git -C ../gitscripts pull')
raise if not system('git -C ../gitscripts reset --hard HEAD')

# Release
require "../gitscripts/ReleaseProduct.rb"

releaseProduct(product, versionFiles, productFiles, recipients)
