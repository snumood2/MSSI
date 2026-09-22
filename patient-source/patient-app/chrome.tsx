import {useState} from "react";
import {Menu,X} from "lucide-react";

export type PatientView="history"|"lifestyle"|"mssi";

const HOME_LINKS=[
  ["설문작성 및 결과 확인","https://snumood.github.io/homepage/#surveys"],
  ["생활습관 점수표","https://snumood.github.io/homepage/#lifestyle-score"],
  ["기분안정성평가 설문지","https://snumood.github.io/homepage/#mood-stability"],
  ["기분 기록지","https://snumood.github.io/homepage/#mood-chart"],
  ["마음안정화 훈련 (호흡/이완)","https://snumood.github.io/homepage/#relaxation"],
  ["마음챙김","https://snumood.github.io/homepage/#mindfulness"],
  ["워크북","https://snumood.github.io/homepage/#workbook"],
  ["연구 성과","https://snumood.github.io/homepage/#research"],
] as const;

export function ClinicHeader({onLogout}:{onLogout?:()=>void}){
  const [menuOpen,setMenuOpen]=useState(false);
  const closeMenu=()=>setMenuOpen(false);
  return <header className="clinic-header">
    <div className="clinic-header-inner">
      <a className="clinic-brand" href="https://snumood.github.io/homepage/#intro">분당서울대학교병원 기분장애클리닉</a>
      <nav className="clinic-nav" aria-label="클리닉 메뉴">{HOME_LINKS.map(([label,href])=><a key={href} href={href}>{label}</a>)}</nav>
      <div className="clinic-header-actions">
        {onLogout&&<button className="clinic-logout" type="button" onClick={onLogout}>로그아웃</button>}
        <button className="clinic-menu-toggle" type="button" aria-label={menuOpen?"메뉴 닫기":"메뉴 열기"} aria-expanded={menuOpen} aria-controls="clinic-mobile-menu" onClick={()=>setMenuOpen(open=>!open)}>{menuOpen?<X size={28}/>:<Menu size={28}/>}</button>
      </div>
    </div>
    <nav id="clinic-mobile-menu" className={`clinic-mobile-menu ${menuOpen?"is-open":""}`} aria-label="클리닉 모바일 메뉴">{HOME_LINKS.map(([label,href])=><a key={href} href={href} onClick={closeMenu}>{label}</a>)}{onLogout&&<button type="button" onClick={()=>{closeMenu();onLogout();}}>로그아웃</button>}</nav>
  </header>;
}

export function PatientNavigation({view,onNavigate}:{view:PatientView;onNavigate:(view:PatientView)=>void}){
  return <nav className="self-tabs" aria-label="나의 기록 메뉴">{([["history","나의 변화"],["lifestyle","생활습관 기록"],["mssi","기분안정성 기록"]] as const).map(([value,label])=><button key={value} aria-current={view===value?"page":undefined} onClick={()=>onNavigate(value)}>{label}</button>)}</nav>;
}
