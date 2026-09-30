from pygltflib import GLTF2
import numpy as np, io
def qmat(q):
    x,y,z,w=q; return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
def local(n):
    if n.matrix: return np.array(n.matrix,dtype=float).reshape(4,4).T
    M=np.eye(4)
    R=qmat(n.rotation) if n.rotation else np.eye(3)
    S=np.diag(n.scale) if n.scale else np.eye(3)
    M[:3,:3]=R@S
    if n.translation: M[:3,3]=n.translation
    return M
def acc(g,blob,i):
    a=g.accessors[i]; bv=g.bufferViews[a.bufferView]
    comp={5126:np.float32,5125:np.uint32,5123:np.uint16,5121:np.uint8}[a.componentType]
    nc={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a.type]
    off=bv.byteOffset+(a.byteOffset or 0); stride=bv.byteStride
    item=np.dtype(comp).itemsize*nc
    if stride and stride!=item:
        raw=np.frombuffer(blob,np.uint8,count=a.count*stride,offset=off).reshape(a.count,stride)[:,:item].copy()
        return np.frombuffer(raw.tobytes(),comp).reshape(a.count,nc)
    return np.frombuffer(blob,comp,count=a.count*nc,offset=off).reshape(a.count,nc)
def load(f):
    """-> list of prims: dict(pos(world), nrm(world), uv, idx, mat), gltf, blob"""
    g=GLTF2().load(f); blob=g.binary_blob()
    par={}
    for i,n in enumerate(g.nodes):
        for c in (n.children or []): par[c]=i
    W={}
    def world(i):
        if i in W: return W[i]
        m=local(g.nodes[i]); 
        if i in par: m=world(par[i])@m
        W[i]=m; return m
    out=[]
    for i,n in enumerate(g.nodes):
        if n.mesh is None: continue
        M=world(i); Nm=np.linalg.inv(M[:3,:3]).T
        for p in g.meshes[n.mesh].primitives:
            pos=acc(g,blob,p.attributes.POSITION).astype(float); pos=(M[:3,:3]@pos.T).T+M[:3,3]
            nr=acc(g,blob,p.attributes.NORMAL).astype(float); nr=(Nm@nr.T).T; nr/=np.linalg.norm(nr,axis=1,keepdims=True)+1e-12
            uv=acc(g,blob,p.attributes.TEXCOORD_0).astype(float)
            idx=acc(g,blob,p.indices).reshape(-1).astype(np.int64)
            out.append(dict(pos=pos,nrm=nr,uv=uv,idx=idx,mat=p.material))
    return out,g,blob
def image(g,blob,i):
    from PIL import Image
    im=g.images[i]; bv=g.bufferViews[im.bufferView]
    return Image.open(io.BytesIO(blob[bv.byteOffset:bv.byteOffset+bv.byteLength]))
