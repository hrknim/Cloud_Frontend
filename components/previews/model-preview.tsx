"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Box, Download, Info, LoaderCircle, Maximize, X } from "lucide-react";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ItemMenuActions, type ItemMenuProps } from "@/components/drive/item-menu";
import PreviewFileNavigation from "./preview-file-navigation";
import driveStyles from "@/components/drive/drive.module.css";
import styles from "./image-preview.module.css";
import modelStyles from "./model-preview.module.css";

export default function ModelPreview({ onClose, ...actions }: ItemMenuProps & { onClose: () => void }) {
  const { item, busy, onInfo, onDownload } = actions;
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [wireframe, setWireframe] = useState(false);
  const [rotate, setRotate] = useState(false);
  const tools = useRef<{ reset: () => void; wireframe: (enabled: boolean) => void; rotate: (enabled: boolean) => void } | null>(null);
  useEffect(() => { tools.current?.wireframe(wireframe); }, [wireframe, status]);
  useEffect(() => { tools.current?.rotate(rotate); }, [rotate, status]);
  useEffect(() => {
    if (!host) return;
    const controller = new AbortController();
    let cleanup: (() => void) | undefined;
    async function start() {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
      const { loadPreviewModel, normalizePreviewModel, disposePreviewModel, modelExtension, modelPreviewFormats } = await import("@/lib/previews/model-preview");
      if (controller.signal.aborted) return;
      const extension = modelExtension(item.name);
      if (!(modelPreviewFormats as readonly string[]).includes(extension)) throw new Error("이 3D 형식은 미리보기를 지원하지 않습니다. GLB·glTF·OBJ·STL·PLY·FBX 파일을 사용해 주세요.");
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.domElement.setAttribute("aria-label", `${item.name} 3D 모델`);
      renderer.domElement.setAttribute("role", "img");
      host!.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x64748b, 3));
      const key = new THREE.DirectionalLight(0xffffff, 4); key.position.set(3, 5, 4); scene.add(key);
      const fill = new THREE.DirectionalLight(0xb8d6ff, 2); fill.position.set(-3, 2, -3); scene.add(fill);
      const camera = new THREE.PerspectiveCamera(45, 1, .01, 100);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.minDistance = .2; controls.maxDistance = 30;
      const reset = () => { camera.position.set(3, 2, 3); controls.target.set(0, 0, 0); controls.update(); };
      reset();
      let model: import("three").Object3D | undefined;
      const resize = () => {
        const width = Math.max(1, host!.clientWidth), height = Math.max(1, host!.clientHeight);
        renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
      };
      const observer = new ResizeObserver(resize); observer.observe(host!); resize();
      const onLost = (event: Event) => { event.preventDefault(); setError("3D 그래픽 연결이 중단되었습니다. 뷰어를 닫고 다시 열어 주세요."); setStatus("error"); renderer.setAnimationLoop(null); };
      renderer.domElement.addEventListener("webglcontextlost", onLost);
      cleanup = () => {
        renderer.setAnimationLoop(null); observer.disconnect(); controls.dispose();
        renderer.domElement.removeEventListener("webglcontextlost", onLost);
        if (model) disposePreviewModel(model);
        renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); tools.current = null;
      };
      const response = await fetch(item.contentUrl || `/api/files/${item.id}/content`, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("모델을 읽을 수 없습니다. 접근 권한 또는 원본 파일을 확인해 주세요.");
      const data = await response.arrayBuffer();
      if (controller.signal.aborted) return;
      const loaded = await loadPreviewModel(data, extension);
      if (controller.signal.aborted) { disposePreviewModel(loaded); return; }
      model = loaded;
      model = normalizePreviewModel(loaded);
      scene.add(model);
      tools.current = { reset, rotate: enabled => { controls.autoRotate = enabled; }, wireframe: enabled => {
        model?.traverse(object => {
          const mesh = object as import("three").Mesh;
          if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if ("wireframe" in material) material.wireframe = enabled;
        });
      } };
      renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
      setStatus("ready");
    }
    void start().catch(cause => {
      cleanup?.(); cleanup = undefined;
      if (controller.signal.aborted) return;
      setError(cause instanceof Error && /지원하지|외부 파일|모델을 읽|형상이 없/.test(cause.message) ? cause.message : "3D 모델을 표시하지 못했습니다. WebGL 지원과 파일 형식을 확인해 주세요. 압축 모델은 일반 GLB로 내보내 주세요.");
      setStatus("error");
    });
    return () => { controller.abort(); cleanup?.(); };
  }, [host, item.id, item.contentUrl, item.name]);
  return <DialogPrimitive.Root open onOpenChange={open => { if (!open) onClose(); }}><DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className={styles.overlay} /><DialogPrimitive.Content className={styles.viewer} aria-describedby={undefined}>
      <header className={styles.toolbar}><DialogPrimitive.Close className={styles.button} aria-label="미리보기 닫기"><X size={22} /></DialogPrimitive.Close><Box className={styles.fileIcon} size={20} /><DialogPrimitive.Title className={styles.title}>{item.name}</DialogPrimitive.Title><div className={styles.actions}><PreviewFileNavigation /><button className={styles.button} aria-label="파일 정보 보기" onClick={onInfo}><Info size={20} /></button><button className={styles.button} aria-label="모델 다운로드" disabled={busy} onClick={onDownload}><Download size={20} /></button></div></header>
      <nav className={styles.menus} aria-label="3D 미리보기 메뉴">
        <DropdownMenu><DropdownMenuTrigger asChild><button className={styles.menuButton} disabled={busy}>파일</button></DropdownMenuTrigger><DropdownMenuContent align="start" className={driveStyles.itemMenu}><ItemMenuActions {...actions} /></DropdownMenuContent></DropdownMenu>
        <DropdownMenu><DropdownMenuTrigger asChild><button className={styles.menuButton}>보기</button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuItem disabled={status !== "ready"} onSelect={() => tools.current?.reset()}><Maximize />시점 초기화</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuCheckboxItem checked={wireframe} disabled={status !== "ready"} onCheckedChange={setWireframe}>와이어프레임</DropdownMenuCheckboxItem><DropdownMenuCheckboxItem checked={rotate} disabled={status !== "ready"} onCheckedChange={setRotate}>자동 회전</DropdownMenuCheckboxItem></DropdownMenuContent></DropdownMenu>
        <DropdownMenu><DropdownMenuTrigger asChild><button className={styles.menuButton}>도움말</button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuLabel>3D 미리보기</DropdownMenuLabel><DropdownMenuSeparator /><p className={styles.help}>좌클릭 드래그: 회전 · 휠: 확대/축소<br />우클릭 드래그: 이동 · 두 손가락: 이동/확대<br />보기 메뉴에서 시점 초기화·와이어프레임·자동 회전<br />GLB·glTF·OBJ·STL·PLY·FBX 자체 포함 파일 지원<br />외부 텍스처·MTL·압축 확장·애니메이션 재생은 미지원<br />Esc로 닫습니다.</p></DropdownMenuContent></DropdownMenu>
      </nav>
      <div className={modelStyles.content}><div ref={setHost} className={modelStyles.stage} />{status !== "ready" && <div className={styles.message} role={status === "error" ? "alert" : "status"}>{status === "loading" ? <><LoaderCircle className={styles.spinner} size={28} /><p>3D 모델을 불러오는 중입니다.</p></> : <><Box size={40} /><p>{error}</p><p className={styles.hint}>파일을 다운로드해서 확인해 주세요.</p></>}</div>}</div>
      <footer className={modelStyles.hint}>좌클릭 회전 · 휠 확대/축소 · 우클릭 이동 <button className={styles.menuButton} disabled={status !== "ready"} onClick={() => tools.current?.reset()}>시점 초기화</button></footer>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal></DialogPrimitive.Root>;
}
