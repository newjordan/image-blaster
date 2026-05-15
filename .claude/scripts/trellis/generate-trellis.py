#!/usr/bin/env python3
"""TRELLIS image-to-3D: Quick test — skip mesh render, just generate Gaussians."""
import argparse, json, os, sys, time

def gen(args):
    os.environ['SPCONV_ALGO'] = 'native'
    os.environ['ATTN_BACKEND'] = 'sdpa'
    os.environ['SPARSE_ATTN_BACKEND'] = 'xformers'  # sparse attention needs xformers
    os.environ['PYTHONDONTWRITEBYTECODE'] = '1'
    
    # Authenticate with HuggingFace
    try:
        with open(os.path.expanduser('~/.cache/huggingface/token')) as f:
            token = f.read().strip()
        if token:
            from huggingface_hub import login
            login(token=token)
    except:
        pass
    
    sys.path.insert(0, os.path.expanduser('~/TRELLIS'))
    from PIL import Image
    import torch
    from trellis.pipelines import TrellisImageTo3DPipeline
    
    print(f"Loading TRELLIS pipeline...", file=sys.stderr)
    pipeline = TrellisImageTo3DPipeline.from_pretrained("microsoft/TRELLIS-image-large")
    pipeline.cuda()
    
    image = Image.open(args.image).convert("RGB")
    print(f"Generating 3D model from {args.image}...", file=sys.stderr)
    t0 = time.time()
    
    outputs = pipeline.run(image, seed=args.seed)
    
    elapsed = time.time() - t0
    print(f"✅ Generation done in {elapsed:.1f}s", file=sys.stderr)
    
    os.makedirs(args.output_dir, exist_ok=True)
    base = os.path.splitext(os.path.basename(args.image))[0]
    
    # PLY (Gaussian splat — may fail on numpy version mismatch)
    ply_path = os.path.join(args.output_dir, f"{base}.ply")
    try:
        outputs['gaussian'][0].save_ply(ply_path)
        print(f"Gaussian PLY saved: {ply_path}", file=sys.stderr)
    except Exception as e:
        print(f"PLY export skipped (numpy compat): {e}", file=sys.stderr)
        ply_path = None
    
    # Also try mesh export via trimesh
    mesh = outputs.get('mesh', [None])[0]
    obj_path = None
    if mesh is not None:
        try:
            import trimesh
            tm = trimesh.Trimesh(vertices=mesh.vertices.cpu().numpy(), faces=mesh.faces.cpu().numpy())
            if mesh.vertex_attrs is not None:
                tm.visual.vertex_colors = mesh.vertex_attrs.cpu().numpy()
            obj_path = os.path.join(args.output_dir, f"{base}.obj")
            tm.export(obj_path)
            print(f"Mesh saved: {obj_path}", file=sys.stderr)
        except Exception as e:
            print(f"Mesh export skipped: {e}", file=sys.stderr)
    
    result = {
        "output_dir": args.output_dir,
        "ply": ply_path,
        "obj": obj_path,
        "elapsed_seconds": round(elapsed, 1),
        "seed": args.seed
    }
    
    meta_path = os.path.join(args.output_dir, f"{base}-trellis.json")
    with open(meta_path, 'w') as f:
        json.dump(result, f, indent=2)
    
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    p = argparse.ArgumentParser(description="TRELLIS image-to-3D")
    p.add_argument("--image", required=True)
    p.add_argument("--output-dir", required=True)
    p.add_argument("--seed", type=int, default=1)
    args = p.parse_args()
    gen(args)
