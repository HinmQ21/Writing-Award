// glTF Transform CLI config for the Capy web build:
//   npx -y @gltf-transform/cli@4 meshopt dedup.glb capy.glb --config art/capy/meshopt.config.mjs
// Everything stays at the CLI defaults (`--level high`) except the EXPONENTIAL filter that meshopt applies
// to animation translation/scale outputs: 16 mantissa bits instead of 12. At 12 bits the scarf tail drifts
// 3.5 mm and the Walk contact slip goes over 0.3 mm/frame; 16 bits costs about 8 KB.
// No imports: the encoder the CLI already registered is wrapped, so this works from any checkout.
const EXP_BITS = 16;

export default {
  onProgramReady({ io }) {
    const base = io._dependencies["meshopt.encoder"];
    if (!base) throw new Error("meshopt.config.mjs: the CLI registered no meshopt.encoder");
    const encoder = Object.create(base);
    encoder.encodeFilterExp = (source, count, stride, bits, mode) =>
      base.encodeFilterExp(source, count, stride, Math.max(bits, EXP_BITS), mode);
    io.registerDependencies({ "meshopt.encoder": encoder });
  },
};
