const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Add the linked candid_api package to the watch folders
const candidApiPath = path.resolve(__dirname, '../api');

config.watchFolders = [candidApiPath];

// Ensure Metro resolves the symlinked package correctly
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(candidApiPath, 'node_modules'),
];

// Add extraNodeModules to help resolve the package
config.resolver.extraNodeModules = {
  'candid_api': candidApiPath,
};

module.exports = config;
