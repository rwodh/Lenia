import { LeniaError } from '../errors.js';

function compile(gl, type, source, label) {
  const shader = gl.createShader(type);
  if (!shader) throw new LeniaError('SHADER_COMPILE', `Could not create a GPU shader (${label}).`);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || '(no log)';
    gl.deleteShader(shader);
    throw new LeniaError('SHADER_COMPILE', `A graphics shader failed to compile (${label}).`, { detail: log });
  }
  return shader;
}

/**
 * Compile and link a program. `uniformNames` are resolved once up front; a name
 * that is not an active uniform is treated as a programming error (typo / dead code).
 */
export function createProgram(gl, name, vertexSrc, fragmentSrc, uniformNames = []) {
  const vs = compile(gl, gl.VERTEX_SHADER, vertexSrc, `${name} vertex`);
  let fs;
  try {
    fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSrc, `${name} fragment`);
  } catch (e) {
    gl.deleteShader(vs);
    throw e;
  }

  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs); // flagged for deletion; freed with the program
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) || '(no log)';
    gl.deleteProgram(program);
    throw new LeniaError('PROGRAM_LINK', `A graphics program failed to link (${name}).`, { detail: log });
  }

  const uniforms = {};
  for (const u of uniformNames) {
    const loc = gl.getUniformLocation(program, u);
    if (loc === null) {
      gl.deleteProgram(program);
      throw new LeniaError('UNIFORM_MISSING', `Internal error: uniform "${u}" not found in program "${name}".`);
    }
    uniforms[u] = loc;
  }

  return { program, uniforms, use: () => gl.useProgram(program), dispose: () => gl.deleteProgram(program) };
}
