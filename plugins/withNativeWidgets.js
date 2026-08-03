const { withXcodeProject } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

module.exports = function withNativeWidgets(config) {
  return withXcodeProject(config, (modConfig) => {
    const widgetNames = ["EthosCashflowStatsWidget", "EthosTimeMapWidget"];
    const targetDirectory = path.join(modConfig.modRequest.platformProjectRoot, "ExpoWidgetsTarget");

    if (!fs.existsSync(targetDirectory)) {
      throw new Error("Native Ethos widgets require the expo-widgets plugin to run first.");
    }

    for (const widgetName of widgetNames) {
      const sourcePath = path.join(modConfig.modRequest.projectRoot, "plugins", "native", `${widgetName}.swift`);
      const targetPath = path.join(targetDirectory, `${widgetName}.swift`);
      fs.copyFileSync(sourcePath, targetPath);
    }
    return modConfig;
  });
};
