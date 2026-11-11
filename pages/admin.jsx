export default function Admin() {
  return null;
}

export function getServerSideProps() {
  return {
    redirect: {
      destination: '/index.html',
      permanent: false,
    },
  };
}
