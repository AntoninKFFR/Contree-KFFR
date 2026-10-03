// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BiddingPanel } from "@/components/BiddingPanel";
import { HumanHand } from "@/components/HumanHand";
import { GameTable } from "@/components/GameTable";
import { clonePlayerPreferences } from "@/lib/preferences/playerPreferences";
import { createInitialGame } from "@/engine/game";
import { buildCustomRuleset } from "@/engine/rulesets/custom";
import type { Contract, ContractMode } from "@/engine/types";

const preferences = vi.hoisted(() => ({ value: {} as ReturnType<typeof clonePlayerPreferences> }));
vi.mock("@/components/settings/PlayerPreferencesProvider", () => ({ usePlayerPreferences: () => ({ preferences: preferences.value, effectiveReducedMotion: true }) }));
beforeEach(() => {
  preferences.value=clonePlayerPreferences();
  vi.stubGlobal("requestAnimationFrame",(callback: FrameRequestCallback)=>setTimeout(()=>callback(0),0));
});
afterEach(()=>{ cleanup(); vi.unstubAllGlobals(); });
const rules=buildCustomRuleset({presetId:"contree-kffr",overrides:{bidding:{allowNoTrump:true,allowAllTrump:true,allowGenerale:true,generaleAllowNoTrump:true,generaleAllowAllTrump:true}}}).bidding;
function panel(contract: Contract|null=null,options={canBid:true,canCoinche:false,canSurcoinche:false}) {
  const callbacks={onBid:vi.fn(),onPass:vi.fn(),onCapot:vi.fn(),onGenerale:vi.fn(),onCoinche:vi.fn(),onSurcoinche:vi.fn()};
  render(<BiddingPanel {...options} currentContract={contract} biddingRules={rules} compact playerId={0} {...callbacks}/>);
  return callbacks;
}
describe("shared game bidding interactions",()=>{
  it("selects every numeric value and all six modes without changing action payloads",()=>{
    const callbacks=panel();
    for(const value of [80,90,100,110,120,130,140,150,160]) {
      fireEvent.click(screen.getByRole('button',{name:`Valeur ${value}`}));
      fireEvent.click(screen.getByRole('button',{name:'Annoncer'}));
      expect(callbacks.onBid).toHaveBeenLastCalledWith(value,{kind:'suit',suit:'hearts'});
    }
    for(const [label,mode] of [['Trefle',{kind:'suit',suit:'clubs'}],['Carreau',{kind:'suit',suit:'diamonds'}],['Coeur',{kind:'suit',suit:'hearts'}],['Pique',{kind:'suit',suit:'spades'}],['Sans Atout',{kind:'no-trump'}],['Tout Atout',{kind:'all-trump'}]] as [string,ContractMode][]) {
      fireEvent.click(screen.getByRole('button',{name:`Atout ${label}`}));
      fireEvent.click(screen.getByRole('button',{name:'Annoncer'}));
      expect(callbacks.onBid).toHaveBeenLastCalledWith(160,mode);
    }
    fireEvent.click(screen.getByRole('button',{name:'Passer'})); expect(callbacks.onPass).toHaveBeenCalledOnce();
  });
  it.each(['Capot','Générale','Contrer','Surcontrer'] as const)("confirms %s, supports Escape and restores the exact trigger",async(label)=>{
    preferences.value.gameplay.confirmGenerale=true;
    const contract:Contract={playerId:label==='Contrer'?1:0,teamId:label==='Contrer'?1:0,value:90,trump:'hearts',status:label==='Surcontrer'?'coinched':'normal'};
    const callbacks=panel(['Capot','Générale'].includes(label)?null:contract,{canBid:true,canCoinche:label==='Contrer',canSurcoinche:label==='Surcontrer'});
    const trigger=screen.getByRole('button',{name:label}); trigger.focus(); fireEvent.click(trigger);
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button',{name:'Confirmer'}));
    fireEvent.keyDown(document,{key:'Escape'});
    await waitFor(()=>expect(document.activeElement).toBe(trigger));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    fireEvent.click(trigger); fireEvent.click(screen.getByRole('button',{name:'Annuler'}));
    await waitFor(()=>expect(document.activeElement).toBe(trigger));
    fireEvent.click(trigger); fireEvent.click(screen.getByRole('button',{name:'Confirmer'}));
    const callback=label==='Capot'?callbacks.onCapot:label==='Générale'?callbacks.onGenerale:label==='Contrer'?callbacks.onCoinche:callbacks.onSurcoinche;
    expect(callback).toHaveBeenCalledOnce();
  });
  it.each(['coinched','capot','generale','maximum'] as const)("preserves the empty-value message/actions for %s",kind=>{
    const contract:Contract=kind==='capot'?{kind:'capot',value:250,playerId:1,teamId:1,trump:'hearts',status:'normal'}:kind==='generale'?{kind:'generale',value:500,playerId:1,teamId:1,trump:'hearts',status:'normal'}:{value:160,playerId:0,teamId:0,trump:'hearts',status:kind==='coinched'?'coinched':'normal'};
    panel(contract,{canBid:true,canCoinche:kind!=='coinched',canSurcoinche:kind==='coinched'});
    expect(screen.queryAllByRole('button',{name:/Valeur /})).toHaveLength(0);
    expect(screen.getByRole('button',{name:'Annoncer'}).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button',{name:'Passer'}).hasAttribute('disabled')).toBe(false);
    expect(document.querySelector('.coinche-bidding-empty')?.textContent).toBeTruthy();
  });
  it("disables all choices while other players announce",()=>{
    panel(null,{canBid:false,canCoinche:false,canSurcoinche:false});
    expect(screen.getByRole('heading',{name:'Les autres joueurs annoncent…'})).toBeTruthy();
    for(const button of screen.getAllByRole('button')) expect(button.hasAttribute('disabled')).toBe(true);
  });
});
describe("shared hand and table presentation",()=>{
  it("renders eight down to one in-scene cards and preserves the saved size",()=>{
    const cards=createInitialGame(()=>.1).hands[0]; preferences.value.cards.cardSize='large';
    const props={cards,legalCards:cards,canPlay:true,onPlayCard:vi.fn(),inScene:true};
    const view=render(<HumanHand {...props}/>);
    for(let count=8;count>=1;count--) {
      view.rerender(<HumanHand {...props} cards={cards.slice(0,count)}/>);
      expect(screen.getAllByRole('button')).toHaveLength(count);
      expect(screen.getAllByRole('button')[0].getAttribute('data-card-size')).toBe('large');
    }
    expect(preferences.value.cards.cardSize).toBe('large');
  });
  it("keeps legal highlights, illegal dimming, feedback and disabled-click preference",()=>{
    const cards=createInitialGame(()=>.1).hands[0]; const onPlayCard=vi.fn();
    preferences.value.assistance.disableIllegalCardClicks=false;
    const props={cards,legalCards:[cards[0]],canPlay:true,onPlayCard,inScene:true,illegalCardMessage:()=>"Il faut fournir la couleur demandée."};
    const view=render(<HumanHand {...props}/>);
    const illegal=document.querySelector<HTMLButtonElement>('button[data-playable="false"]')!;
    expect(illegal.dataset.dimmed).toBe('true'); fireEvent.click(illegal);
    expect(screen.getByRole('status').textContent).toBe('Il faut fournir la couleur demandée.');
    expect(onPlayCard).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector('button[data-playable="true"]')!); expect(onPlayCard).toHaveBeenCalledWith(cards[0]);
    preferences.value.assistance.disableIllegalCardClicks=true; view.rerender(<HumanHand {...props}/>);
    expect(illegal.disabled).toBe(true);
  });
  it("retains four seats, full names, urgent timer, contract, announcements and inactive player",()=>{
    const state=createInitialGame(()=>.1); state.playerNames={0:'A'.repeat(40),1:'B'.repeat(40),2:'C'.repeat(40),3:'D'.repeat(40)};
    state.phase='playing';state.currentPlayerId=0;state.contract={kind:'generale',value:500,playerId:0,teamId:0,trump:'hearts',status:'surcoinched'};
    render(<GameTable state={state} immersiveMobileLandscape turnSecondsRemaining={8}/>);
    expect(document.querySelectorAll('.coinche-player-panel')).toHaveLength(4);
    expect(document.querySelectorAll('.coinche-player-name[title]')).toHaveLength(4);
    expect(screen.getByRole('timer').textContent).toContain('8');
    expect(document.querySelector('.coinche-hud-contract')?.getAttribute('title')).toContain('Surcoinché');
    expect(document.querySelector('.coinche-table-hud')?.textContent).toContain('ne joue pas cette donne');
    expect(document.querySelector('.coinche-bubble-bottom')).toBeTruthy();
  });
});
