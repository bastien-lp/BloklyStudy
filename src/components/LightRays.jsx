import { useEffect, useRef } from 'react';

export default function LightRays() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas.getContext('webgl');
    if (!gl) return;

    const VS = 'attribute vec2 position;void main(){gl_Position=vec4(position,0.0,1.0);}';

    const FS = [
      'precision highp float;',
      'uniform float iTime;',
      'uniform vec2 iResolution;',
      'uniform vec2 rayPos;',
      'uniform vec2 rayDir;',
      'uniform vec2 mousePos;',
      'uniform float mouseInfluence;',

      'float rayStrength(vec2 src,vec2 dir,vec2 coord,float sA,float sB,float spd){',
      '  vec2 d=normalize(coord-src);',
      '  float c=dot(d,dir);',
      '  float spread=pow(max(c,0.0),4.0);',
      '  float dist=length(coord-src);',
      '  float fall=clamp(1.0-dist/(iResolution.x*2.0),0.0,1.0);',
      '  float base=clamp((0.45+0.15*sin(c*sA+iTime*spd))+(0.3+0.2*cos(-c*sB+iTime*spd)),0.0,1.0);',
      '  return base*fall*spread;',
      '}',

      'void main(){',
      '  vec2 coord=vec2(gl_FragCoord.x,iResolution.y-gl_FragCoord.y);',
      '  vec2 fDir=normalize(mix(rayDir,normalize(mousePos*iResolution-rayPos),mouseInfluence));',
      '  float r=rayStrength(rayPos,fDir,coord,36.22,21.11,1.5)',
      '       +rayStrength(rayPos,fDir,coord,22.39,18.02,1.1);',
      '  float y=1.0-coord.y/iResolution.y;',
      '  vec3 col=vec3(r*(0.1+y*0.8),r*(0.1+y*0.4),r*(0.3+y*0.5));',
      '  col*=vec3(0.55,0.32,1.0);',
      '  gl_FragColor=vec4(col,1.0);',
      '}'
    ].join('\n');

    function mkShader(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    }

    const prog = gl.createProgram();
    gl.attachShader(prog, mkShader(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, mkShader(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, 'iTime');
    const uRes = gl.getUniformLocation(prog, 'iResolution');
    const uRayPos = gl.getUniformLocation(prog, 'rayPos');
    const uRayDir = gl.getUniformLocation(prog, 'rayDir');
    const uMouse = gl.getUniformLocation(prog, 'mousePos');
    const uMouseInf = gl.getUniformLocation(prog, 'mouseInfluence');

    let mx = 0.5, my = 0.5, tmx = 0.5, tmy = 0.5;
    const onMouseMove = (e) => {
      tmx = e.clientX / window.innerWidth;
      tmy = e.clientY / window.innerHeight;
    };
    window.addEventListener('mousemove', onMouseMove);

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform2f(uRayPos, canvas.width * 0.5, canvas.height * -0.1);
      gl.uniform2f(uRayDir, 0.0, 1.0);
      gl.uniform1f(uMouseInf, 0.12);
    }
    window.addEventListener('resize', resize);
    resize();

    let raf;
    function frame(ts) {
      raf = requestAnimationFrame(frame);
      mx += (tmx - mx) * 0.05;
      my += (tmy - my) * 0.05;
      gl.clearColor(0.039, 0.039, 0.094, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uTime, ts * 0.001);
      gl.uniform2f(uMouse, mx, my);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
        display: 'block'
      }}
    />
  );
}