const fs = require('fs');
const path = require('path');
const {
  IOSConfig,
  createRunOncePlugin,
  withDangerousMod,
  withXcodeProject,
} = require('@expo/config-plugins');

const SWIFT_FILE = 'ImportApplePayTransactionIntent.swift';
const TEMPLATE_FILE = path.join(__dirname, 'apple-pay', SWIFT_FILE);
const {
  addBuildSourceFileToGroup,
  getApplicationNativeTarget,
} = IOSConfig.XcodeUtils;

function withApplePayTransactionIntent(config) {
  config = withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const projectName = modConfig.modRequest.projectName;
      const destination = path.join(
        modConfig.modRequest.platformProjectRoot,
        projectName,
        SWIFT_FILE,
      );

      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(TEMPLATE_FILE, destination);

      return modConfig;
    },
  ]);

  config = withXcodeProject(config, (modConfig) => {
    const project = modConfig.modResults;
    const projectName = modConfig.modRequest.projectName;
    const filePath = `${projectName}/${SWIFT_FILE}`;
    const target = getApplicationNativeTarget({ project, projectName });

    if (!project.hasFile(filePath)) {
      modConfig.modResults = addBuildSourceFileToGroup({
        filepath: filePath,
        groupName: projectName,
        project,
        targetUuid: target.uuid,
      });
    }

    return modConfig;
  });

  return config;
}

module.exports = createRunOncePlugin(
  withApplePayTransactionIntent,
  'with-apple-pay-transaction-intent',
  '1.0.0',
);
