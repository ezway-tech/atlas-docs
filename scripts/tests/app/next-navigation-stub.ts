export function useRouter(){
 return {refresh(){},push(){},replace(){},prefetch(){},back(){},forward(){}};
}
export function usePathname(){return '/';}
export function useSearchParams(){return new URLSearchParams();}
export function useParams(){return {};}
