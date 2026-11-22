  // ---------- the GLSL of the WebGL look (post-webgl.js): the passes over the frame and the smoke fluid ----------
  const POST_GLSL = (() => {
    const VS = "attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}";
    // the bright parts only (a soft knee above the threshold), fire and neon kept in their colours
    const BRIGHT = "precision mediump float;varying vec2 v;uniform sampler2D t;uniform vec2 px;void main(){" +
      "vec3 c=(texture2D(t,v+px*vec2(-.5,-.5)).rgb+texture2D(t,v+px*vec2(.5,-.5)).rgb+texture2D(t,v+px*vec2(-.5,.5)).rgb+texture2D(t,v+px*vec2(.5,.5)).rgb)*.25;" +
      "float l=max(c.r,max(c.g,c.b));float k=clamp((l-.72)/.28,0.,1.);gl_FragColor=vec4(c*k*k*.8,1.);}";
    // a 9-tap gaussian along one direction
    const BLUR = "precision mediump float;varying vec2 v;uniform sampler2D t;uniform vec2 d;void main(){" +
      "vec3 s=texture2D(t,v).rgb*.227;s+=(texture2D(t,v+d*1.385).rgb+texture2D(t,v-d*1.385).rgb)*.316;s+=(texture2D(t,v+d*3.231).rgb+texture2D(t,v-d*3.231).rgb)*.07;gl_FragColor=vec4(s,1.);}";
    // the frame + both glows, graded; the vignette; the colour split (ca) out from the middle
    // Light: up to 16 lights (world x, y, reach, strength; colour), each falling off with the square of the distance and
    // blocked by what stands between it and the point lit (within 260 px of it: light from above leaves short shadows):
    // a walk of 10 steps along the way through the occluder map
    // (walls, planets, crates: one small picture of the whole world). A point inside a wall is its top, lit as it is
    const LIGHT = "#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n" +
      "varying vec2 v;uniform sampler2D m;uniform vec2 cam,view,world;uniform vec4 lp[16];uniform vec3 lc[16];uniform float lh[16];uniform float ls[16];uniform float n;void main(){" +
      "vec2 p=cam+vec2(v.x-.5,.5-v.y)*view;vec3 acc=vec3(0.);float heat=0.;float self=texture2D(m,p/world).a;" +
      "for(int i=0;i<16;i++){if(float(i)>=n)break;vec4 L=lp[i];vec2 d=L.xy-p;float r=length(d);if(r>L.z)continue;float a=1.-r/L.z;a*=a*L.w;" +
      // soft shadows: along the way to the light, what stands there darkens the point the more the closer it is (a
      // shadow is deep at the foot of a wall and thins out away from it, no hard end), the map sampled smoothly, the
      // steps shifted a little from pixel to pixel so no bands show
      "float vis=1.;if(self<.5){float span=min(r*.92,320.);vec2 dir=d/max(r,1.);float jt=fract(sin(dot(v,vec2(12.9898,78.233)))*43758.5453);float occ=0.;" +
      "for(int k=1;k<16;k++){float t=(float(k)-jt)/15.*span;vec2 q=p+dir*t;if(length(L.xy-q)>ls[i]){occ=max(occ,texture2D(m,q/world).a*pow(1.-t/span,1.4));}}" +
      "vis=1.-smoothstep(.05,.9,occ)*.9;}" +
      "acc+=lc[i]*a*vis;float hz=1.-r/(L.z*.6);heat+=lh[i]*max(hz,0.)*max(hz,0.);}gl_FragColor=vec4(acc,min(heat,1.));}";
    // heat haze: where the light map says it is hot (its alpha), the picture shimmers (two waves out of step)
    // shock waves (up to 4: centre, radius, width, strength in the view's terms): the picture bends outward across each
    // ring as through a lens, a little blurred and split in colour at its edge
    const COMP = "precision mediump float;varying vec2 v;uniform sampler2D t,b1,b2,lm,dye;uniform float bl,ca,vig,sat,dbg,amb,time,fl,asp,wn,lon;uniform vec4 wv[4];uniform float ww[4];void main(){" +
      "float h=texture2D(lm,v).a*lon;vec2 u=v+vec2(sin(v.y*140.+time*9.)+sin(v.y*67.-time*5.)*.6,cos(v.x*120.+time*8.)*.8)*h*.0016;" +
      "float wsum=0.;for(int i=0;i<4;i++){if(float(i)>=wn)break;vec2 d=v-wv[i].xy;d.x*=asp;float L=length(d);float k=exp(-pow((L-wv[i].z)/ww[i],2.))*wv[i].w;u-=normalize(d+1e-5)*vec2(1./asp,1.)*k;wsum+=k;}" +
      "vec2 o=(v-.5)*ca+vec2(wsum*.6);vec3 c=vec3(texture2D(t,u+o).r,texture2D(t,u).g,texture2D(t,u-o).b);" +
      "if(wsum>.002){c=(c+texture2D(t,u+vec2(wsum*1.5,0.)).rgb+texture2D(t,u-vec2(0.,wsum*1.5)).rgb)/3.;}" +
      "vec3 L=texture2D(lm,v).rgb*lon;c=c*(mix(1.,amb,lon)+L*1.8)+L*.22;if(dbg>.5)c=L+texture2D(t,v).rgb*.15;" +
      // the smoke (the fluid's dye: its colour premultiplied, its thickness in alpha), lit as the world is
      "if(fl>.5){vec4 s=texture2D(dye,v);float a=clamp(s.a,0.,1.)*.82;vec3 sc=s.rgb/max(s.a,.001);c=mix(c,sc*(mix(1.,amb,lon)*.9+L*1.6),a);}" +
      "c+=(texture2D(b1,v).rgb*.9+texture2D(b2,v).rgb*1.1)*bl;" +
      "float l=dot(c,vec3(.299,.587,.114));c=mix(vec3(l),c,sat);c=(c-.5)*1.04+.5;" +
      "float r=length((v-.5)*vec2(1.,.8));c*=1.-vig*smoothstep(.45,.95,r);" +
      "c=c/(1.+max(c-.85,0.)*.9);gl_FragColor=vec4(c,1.);}";
    const H = "precision mediump float;varying vec2 v;uniform vec2 px;";
    // the smoke fluid's steps (a fragment shader each)
    const FLUID = {
      advect: H + "uniform sampler2D vel,src;uniform vec2 shift;uniform float dt,keep;void main(){vec2 c=v-texture2D(vel,v).xy*dt*px+shift;" +
        "gl_FragColor=(c.x<0.||c.y<0.||c.x>1.||c.y>1.)?vec4(0.):texture2D(src,c)*keep;}",
      splat: H + "uniform sampler2D base;uniform vec2 at;uniform vec4 col;uniform float r,radial,aspect;void main(){vec2 d=v-at;d.x*=aspect;float k=exp(-dot(d,d)/r);" +
        "vec4 add=radial>.5?vec4(normalize(d+1e-5)*col.x,0.,0.):col;gl_FragColor=texture2D(base,v)+add*k;}",
      curl: H + "uniform sampler2D vel;void main(){float l=texture2D(vel,v-vec2(px.x,0.)).y,r=texture2D(vel,v+vec2(px.x,0.)).y,b=texture2D(vel,v-vec2(0.,px.y)).x,t=texture2D(vel,v+vec2(0.,px.y)).x;gl_FragColor=vec4(.5*(r-l-t+b),0.,0.,1.);}",
      vort: H + "uniform sampler2D vel,cu;uniform float dt,amt;void main(){float l=texture2D(cu,v-vec2(px.x,0.)).x,r=texture2D(cu,v+vec2(px.x,0.)).x,b=texture2D(cu,v-vec2(0.,px.y)).x,t=texture2D(cu,v+vec2(0.,px.y)).x,c=texture2D(cu,v).x;" +
        "vec2 f=.5*vec2(abs(t)-abs(b),abs(r)-abs(l));f/=length(f)+1e-4;f*=amt*c;f.y*=-1.;gl_FragColor=vec4(texture2D(vel,v).xy+f*dt,0.,1.);}",
      div: H + "uniform sampler2D vel;void main(){float l=texture2D(vel,v-vec2(px.x,0.)).x,r=texture2D(vel,v+vec2(px.x,0.)).x,b=texture2D(vel,v-vec2(0.,px.y)).y,t=texture2D(vel,v+vec2(0.,px.y)).y;gl_FragColor=vec4(.5*(r-l+t-b),0.,0.,1.);}",
      press: H + "uniform sampler2D pr,dv;void main(){float l=texture2D(pr,v-vec2(px.x,0.)).x,r=texture2D(pr,v+vec2(px.x,0.)).x,b=texture2D(pr,v-vec2(0.,px.y)).x,t=texture2D(pr,v+vec2(0.,px.y)).x;gl_FragColor=vec4((l+r+b+t-texture2D(dv,v).x)*.25,0.,0.,1.);}",
      grad: H + "uniform sampler2D pr,vel;void main(){float l=texture2D(pr,v-vec2(px.x,0.)).x,r=texture2D(pr,v+vec2(px.x,0.)).x,b=texture2D(pr,v-vec2(0.,px.y)).x,t=texture2D(pr,v+vec2(0.,px.y)).x;gl_FragColor=vec4(texture2D(vel,v).xy-.5*vec2(r-l,t-b),0.,1.);}"
    };
    return { VS, BRIGHT, BLUR, LIGHT, COMP, FLUID };
  })();
