export default function Index() {
  return null;
}

export function getServerSideProps() {
  return {
    redirect: {
      destination: '/login.html',
      permanent: false,
    },
  };
}
