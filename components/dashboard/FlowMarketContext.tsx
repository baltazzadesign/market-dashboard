'use client';
import {createContext,useContext,useState,type ReactNode} from 'react';
import type {InvestorMarket} from '@/lib/investor-flow';
import {flowMarketNames} from '@/lib/market-flow-selection';
const Context=createContext<{market:InvestorMarket;setMarket:(market:InvestorMarket)=>void}>({market:'combined',setMarket:()=>{}});
export function FlowMarketProvider({children}:{children:ReactNode}){const [market,setMarket]=useState<InvestorMarket>('combined');return <Context.Provider value={{market,setMarket}}>{children}</Context.Provider>;}
export function useFlowMarket(){return useContext(Context);}
export function FlowMarketPicker({label='수급 시장 선택'}:{label?:string}){const {market,setMarket}=useFlowMarket();return <div className="segmented" role="group" aria-label={label}>{(['combined','kospi','kosdaq'] as const).map(key=><button key={key} type="button" className={market===key?'active':''} aria-pressed={market===key} onClick={()=>setMarket(key)}>{flowMarketNames[key]}</button>)}</div>;}
