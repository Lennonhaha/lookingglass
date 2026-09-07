/**
 * LookingGlass: Main entry point
 */

const { TensorOps } = require('./core/tensor-ops');
const { MirrorLayer } = require('./core/mirror-layer');
const { InfiniteMirror } = require('./core/infinite-mirror');
const { TrapdoorGenerator } = require('./trapdoor/trapdoor-generator');

module.exports = {
  TensorOps,
  MirrorLayer,
  InfiniteMirror,
  TrapdoorGenerator,
};
