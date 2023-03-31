var path = require("path")
var fs = require("fs")

const {
  override,
  addDecoratorsLegacy,
  babelInclude,
  disableEsLint,
} = require("customize-cra")

module.exports = function (config, env) {
  config.mode = 'development';

  //config.devtool = 'eval-cheap-module-source-map'
  //config.devtool = 'eval-source-map'
  config.devtool = 'source-map';

  config.optimization.minimize = false;
  //delete config.optimization;

  return Object.assign(
    config,
    override(
      disableEsLint(),
      addDecoratorsLegacy(),
      /*Make sure Babel compiles the stuff in the common folder*/
      babelInclude([
        path.resolve("src"), // don't forget this
        fs.realpathSync("node_modules/telephony/src"),
      ]),
    )(config, env),
  )
}
