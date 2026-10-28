'use client';
import React from 'react';

type LayoutSelectors={getScrollToKey:()=>unknown};
type LayoutActions={readyToScroll:(specPath:unknown,element:Element|null)=>void};
type Props={
  collapsedContent?:React.ReactNode;
  expanded?:boolean;
  title?:React.ReactNode;
  onToggle?:(modelName:string|undefined,expanded:boolean)=>void;
  hideSelfOnExpand?:boolean;
  specPath?:unknown;
  modelName?:string;
  classes?:string;
  layoutSelectors?:LayoutSelectors;
  layoutActions?:LayoutActions;
  children?:React.ReactNode;
};
type State={expanded:boolean;collapsedContent:React.ReactNode;expandedFromProps:boolean};

function samePath(left:unknown,right:unknown){
  if(Object.is(left,right))return true;
  if(left&&typeof left==='object'&&'equals' in left&&typeof (left as {equals?:unknown}).equals==='function'){
    return (left as {equals:(value:unknown)=>boolean}).equals(right);
  }
  return false;
}

export default class ModelCollapse extends React.Component<Props,State>{
  static defaultProps={collapsedContent:'{...}' as React.ReactNode,expanded:false,title:null as React.ReactNode,onToggle:(_modelName?:string,_expanded?:boolean)=>{},hideSelfOnExpand:false};

  static getDerivedStateFromProps(props:Props,state:State):Partial<State>|null{
    const expanded=props.expanded??false;
    if(expanded===state.expandedFromProps)return null;
    return {expanded,expandedFromProps:expanded};
  }

  constructor(props:Props){
    super(props);
    const expanded=props.expanded??false;
    this.state={expanded,collapsedContent:props.collapsedContent||'{...}',expandedFromProps:expanded};
  }

  componentDidMount(){
    const {hideSelfOnExpand,expanded,modelName,onToggle}=this.props;
    if(hideSelfOnExpand&&expanded)onToggle?.(modelName,expanded);
  }

  toggleCollapsed=()=>{
    const next=!this.state.expanded;
    this.props.onToggle?.(this.props.modelName,next);
    this.setState({expanded:next});
  };

  onLoad=(node:HTMLSpanElement|null)=>{
    if(!node||!this.props.layoutSelectors)return;
    if(samePath(this.props.layoutSelectors.getScrollToKey(),this.props.specPath))this.toggleCollapsed();
    this.props.layoutActions?.readyToScroll(this.props.specPath,node.parentElement);
  };

  render(){
    const {title,classes,hideSelfOnExpand,children}=this.props;
    const {expanded,collapsedContent}=this.state;
    if(expanded&&hideSelfOnExpand)return <span className={classes||''}>{children}</span>;
    return <span className={classes||''} ref={this.onLoad}>
      <button aria-expanded={expanded} className="model-box-control" onClick={this.toggleCollapsed}>
        {title?<span className="pointer">{title}</span>:null}
        <span className={'model-toggle'+(expanded?'':' collapsed')}/>
        {expanded?null:<span>{collapsedContent}</span>}
      </button>
      {expanded?children:null}
    </span>;
  }
}

export function modelCollapsePlugin(){
  return {components:{ModelCollapse}};
}
